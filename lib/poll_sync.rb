require "json"
require "net/http"
require "uri"

# Makes the poll on polls.gamestats.ai match deck/poll.json.
#
# The API takes the whole poll in one request: POST / creates it, PATCH /:slug
# replaces its title and questions. Resending an unchanged poll is a no-op on the
# server, and question changes are refused once anyone has voted.
module PollSync
  module Routes
    module_function

    def polls = "/"
    def poll(slug) = "/#{slug}"
    def results(slug) = "/#{slug}/results.json"
  end

  Change = Struct.new(:http_method, :path, :body, :summary, keyword_init: true)

  class Planner
    def initialize(definition:, existing_poll:)
      @definition = definition
      @existing_poll = existing_poll
      @slug = definition.fetch("slug")
    end

    # Returns the single request to send, or nil when the live poll already matches.
    def change
      if @existing_poll.nil?
        return Change.new(http_method: :post, path: Routes.polls, body: {poll: poll_body.merge(slug: @slug)},
          summary: ["Create poll #{@slug} with #{desired_questions.size} questions"])
      end

      differences = title_differences + question_differences
      return nil if differences.empty?

      Change.new(http_method: :patch, path: Routes.poll(@slug), body: {poll: poll_body}, summary: differences)
    end

    def questions_changed?
      question_differences.any?
    end

    private

    def poll_body
      {title: @definition.fetch("title"), questions: desired_questions}
    end

    def desired_questions
      @definition.fetch("questions").map do |question|
        {prompt: question.fetch("prompt"), allows_multiple: question.fetch("allows_multiple", false), options: question.fetch("options")}
      end
    end

    def title_differences
      title = @definition.fetch("title")
      @existing_poll["title"] == title ? [] : ["Rename poll: #{@existing_poll["title"]} -> #{title}"]
    end

    # results.json ranks options by votes, so option order can't be compared; labels are.
    def question_differences
      current_questions = @existing_poll.fetch("questions", [])
      differences = []

      desired_questions.each_with_index do |desired, index|
        number = index + 1
        current = current_questions[index]
        if current.nil?
          differences << "Add question #{number}: #{desired[:prompt]}"
          next
        end

        differences << "Question #{number} prompt: #{current["prompt"]} -> #{desired[:prompt]}" if current["prompt"] != desired[:prompt]
        if current["allows_multiple"] != desired[:allows_multiple]
          differences << "Question #{number} #{desired[:allows_multiple] ? "allows" : "stops allowing"} multiple answers"
        end

        current_labels = current.fetch("options", []).map { |option| option["label"] }
        (desired[:options] - current_labels).each { |label| differences << "Question #{number} add option: #{label}" }
        (current_labels - desired[:options]).each { |label| differences << "Question #{number} remove option: #{label}" }
      end

      current_questions.drop(desired_questions.size).each_with_index do |extra, offset|
        differences << "Remove question #{desired_questions.size + offset + 1}: #{extra["prompt"]}"
      end

      differences
    end
  end

  class Client
    class RequestFailed < StandardError; end

    def initialize(base_url:, token:)
      @base_uri = URI(base_url)
      @token = token
    end

    def fetch_poll(slug)
      response = perform(:get, Routes.results(slug))
      return nil if response.code == "404"
      raise RequestFailed, "GET #{Routes.results(slug)} returned #{response.code}: #{response.body}" unless response.is_a?(Net::HTTPSuccess)
      JSON.parse(response.body)
    end

    def apply(change)
      response = perform(change.http_method, change.path, change.body)
      unless response.is_a?(Net::HTTPSuccess)
        raise RequestFailed, "#{change.http_method.upcase} #{change.path} returned #{response.code}: #{response.body}"
      end
      response.body.to_s.empty? ? {} : JSON.parse(response.body)
    end

    private

    def perform(http_method, path, body = nil)
      uri = @base_uri.dup
      uri.path = "#{@base_uri.path.chomp("/")}#{path}"
      request_class = {get: Net::HTTP::Get, post: Net::HTTP::Post, patch: Net::HTTP::Patch}.fetch(http_method)
      request = request_class.new(uri)
      request["Accept"] = "application/json"
      request["Authorization"] = "Bearer #{@token}"
      if body
        request["Content-Type"] = "application/json"
        request.body = JSON.generate(body)
      end
      Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", open_timeout: 10, read_timeout: 20) do |http|
        http.request(request)
      end
    end
  end

  def self.run(definition:, client:, apply:, output: $stdout)
    slug = definition.fetch("slug")
    existing_poll = client.fetch_poll(slug)
    planner = Planner.new(definition: definition, existing_poll: existing_poll)
    change = planner.change

    if change.nil?
      output.puts "The #{slug} poll already matches deck/poll.json."
      return nil
    end

    output.puts(apply ? "Applying:" : "Planned changes (run with --apply to make them):")
    change.summary.each { |line| output.puts "- #{line}" }
    if existing_poll && planner.questions_changed? && existing_poll["voter_count"].to_i.positive?
      output.puts "Warning: #{existing_poll["voter_count"]} people have voted, so the server will refuse question changes."
    end

    client.apply(change) if apply
    change
  end
end
