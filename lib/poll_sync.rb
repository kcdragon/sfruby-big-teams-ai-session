require "json"
require "net/http"
require "uri"

# Makes the poll on Game Stats AI match deck/poll.json. Questions and options are
# matched by position, so rewording keeps their ids (and any votes on them).
module PollSync
  module Routes
    module_function

    def polls = "/polls"
    def poll(slug) = "/polls/#{slug}"
    def questions(slug) = "/polls/#{slug}/questions"
    def question(slug, question_id) = "/polls/#{slug}/questions/#{question_id}"
    def options(slug, question_id) = "/polls/#{slug}/questions/#{question_id}/options"
    def option(slug, question_id, option_id) = "/polls/#{slug}/questions/#{question_id}/options/#{option_id}"
  end

  Change = Struct.new(:http_method, :path, :body, :description, :follow_up_options, keyword_init: true)

  class Planner
    def initialize(definition:, existing_poll:)
      @definition = definition
      @existing_poll = existing_poll
      @slug = definition.fetch("slug")
    end

    def changes
      planned = poll_changes
      desired_questions = @definition.fetch("questions")
      current_questions = sort_by_position(@existing_poll&.fetch("questions", []) || [])

      desired_questions.each_with_index do |desired_question, index|
        position = index + 1
        current_question = current_questions[index]
        if current_question
          planned.concat(question_update(current_question, desired_question, position))
          planned.concat(option_changes(current_question, desired_question.fetch("options")))
        else
          planned << question_create(desired_question, position)
        end
      end

      current_questions.drop(desired_questions.size).each do |extra_question|
        planned << Change.new(
          http_method: :delete,
          path: Routes.question(@slug, extra_question.fetch("id")),
          description: "Delete question #{extra_question["position"]}: #{extra_question["prompt"]}"
        )
      end

      planned
    end

    private

    def poll_changes
      title = @definition.fetch("title")
      if @existing_poll.nil?
        [Change.new(http_method: :post, path: Routes.polls, body: {poll: {slug: @slug, title: title}}, description: "Create poll #{@slug}: #{title}")]
      elsif @existing_poll["title"] != title
        [Change.new(http_method: :patch, path: Routes.poll(@slug), body: {poll: {title: title}}, description: "Rename poll to: #{title}")]
      else
        []
      end
    end

    def question_attributes(desired_question, position)
      {prompt: desired_question.fetch("prompt"), allows_multiple: desired_question.fetch("allows_multiple", false), position: position}
    end

    def question_create(desired_question, position)
      Change.new(
        http_method: :post,
        path: Routes.questions(@slug),
        body: {question: question_attributes(desired_question, position)},
        description: "Add question #{position}: #{desired_question.fetch("prompt")}",
        follow_up_options: desired_question.fetch("options")
      )
    end

    def question_update(current_question, desired_question, position)
      wanted = question_attributes(desired_question, position)
      unchanged = current_question["prompt"] == wanted[:prompt] &&
        current_question["allows_multiple"] == wanted[:allows_multiple] &&
        current_question["position"] == position
      return [] if unchanged

      [Change.new(
        http_method: :patch,
        path: Routes.question(@slug, current_question.fetch("id")),
        body: {question: wanted},
        description: "Update question #{position}: #{current_question["prompt"]} -> #{wanted[:prompt]}"
      )]
    end

    def option_changes(current_question, desired_labels)
      question_id = current_question.fetch("id")
      current_options = sort_by_position(current_question.fetch("options", []))
      planned = []

      desired_labels.each_with_index do |label, index|
        position = index + 1
        current_option = current_options[index]
        if current_option.nil?
          planned << Change.new(http_method: :post, path: Routes.options(@slug, question_id), body: {option: {label: label, position: position}},
            description: "  Add option #{position}: #{label}")
        elsif current_option["label"] != label || current_option["position"] != position
          planned << Change.new(http_method: :patch, path: Routes.option(@slug, question_id, current_option.fetch("id")), body: {option: {label: label, position: position}},
            description: "  Update option #{position}: #{current_option["label"]} -> #{label}")
        end
      end

      current_options.drop(desired_labels.size).each do |extra_option|
        planned << Change.new(http_method: :delete, path: Routes.option(@slug, question_id, extra_option.fetch("id")),
          description: "  Delete option: #{extra_option["label"]}")
      end

      planned
    end

    def sort_by_position(records)
      records.each_with_index.sort_by { |record, index| [record["position"] || index + 1, index] }.map(&:first)
    end
  end

  class Client
    class RequestFailed < StandardError; end

    def initialize(base_url:, token:)
      @base_uri = URI(base_url)
      @token = token
    end

    def fetch_poll(slug)
      response = perform(:get, Routes.poll(slug))
      return nil if response.code == "404"
      raise RequestFailed, "GET #{Routes.poll(slug)} returned #{response.code}: #{response.body}" unless response.is_a?(Net::HTTPSuccess)
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
      request_class = {get: Net::HTTP::Get, post: Net::HTTP::Post, patch: Net::HTTP::Patch, delete: Net::HTTP::Delete}.fetch(http_method)
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
    changes = Planner.new(definition: definition, existing_poll: client.fetch_poll(slug)).changes

    if changes.empty?
      output.puts "The #{slug} poll already matches deck/poll.json."
      return changes
    end

    output.puts(apply ? "Applying #{changes.size} changes:" : "Planned changes (run with --apply to make them):")
    changes.each do |change|
      output.puts "- #{change.description}"
      created = apply ? client.apply(change) : {}
      Array(change.follow_up_options).each_with_index do |label, index|
        output.puts "-   Add option #{index + 1}: #{label}"
        next unless apply

        client.apply(Change.new(
          http_method: :post,
          path: Routes.options(slug, created.fetch("id")),
          body: {option: {label: label, position: index + 1}}
        ))
      end
    end
    changes
  end
end
