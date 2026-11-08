require "net/http"
require "uri"

# Simulates a room of people voting on the live poll the way phones do: open the
# voting page (which counts as joining), read and tap for a while, then submit the
# form once. Timing and choices are random but shaped like a real audience.
module VoteSimulator
  # One question on the voting page: the form field and the option ids it accepts.
  Question = Struct.new(:id, :field, :option_ids, :multiple, keyword_init: true)

  # What one simulated person will do, decided up front so a run can be previewed.
  Person = Struct.new(:number, :opens_at, :think_seconds, :abandons, :answers, keyword_init: true)

  module_function

  # Reads the questions from the voting page's form.
  def parse_questions(html)
    inputs = html.scan(/<input\b[^>]*>/).filter_map do |tag|
      type = tag[/type="(radio|checkbox)"/, 1] or next
      name = tag[/name="(selections\[(\d+)\]\[\])"/, 1] or next
      {field: name, question_id: name[/\d+/].to_i, option_id: tag[/value="(\d+)"/, 1].to_i, multiple: type == "checkbox"}
    end
    inputs.group_by { |input| input[:question_id] }.map do |question_id, options|
      Question.new(id: question_id, field: options.first[:field], option_ids: options.map { |o| o[:option_id] }, multiple: options.first[:multiple])
    end
  end

  def authenticity_token(html)
    html[/name="authenticity_token" value="([^"]+)"/, 1]
  end

  # Each question gets a fixed popularity per option, so the room leans the same way
  # a real one does instead of spreading evenly. Weights fall off roughly like 1/rank.
  def popularity(questions, random)
    questions.to_h do |question|
      ranked = question.option_ids.shuffle(random: random)
      weights = ranked.each_with_index.to_h { |option_id, rank| [option_id, 1.0 / (rank + 1)**1.1 * (0.6 + random.rand)] }
      [question.id, weights]
    end
  end

  def weighted_pick(weights, random)
    target = random.rand * weights.values.sum
    weights.each do |option_id, weight|
      target -= weight
      return option_id if target <= 0
    end
    weights.keys.last
  end

  def choose_answers(questions, popularity, random, skip_rate:)
    questions.each_with_object({}) do |question, answers|
      next if random.rand < skip_rate

      weights = popularity.fetch(question.id).dup
      picks = question.multiple ? [1, 1, 2, 2, 2, 3, 3, 4].sample(random: random) : 1
      answers[question.field] = Array.new([picks, weights.size].min) do
        weighted_pick(weights, random).tap { |picked| weights.delete(picked) }
      end
    end
  end

  # When people open the page, in seconds from the start. Most scan the QR code as
  # soon as it's on screen (a burst that tails off), and a few wander in later.
  def arrival_times(count, window:, random:)
    Array.new(count) do
      if random.rand < 0.85
        # Exponential with its mean at a fifth of the window: front-loaded.
        [-Math.log(1 - random.rand) * window / 5.0, window].min
      else
        random.rand * window
      end
    end.sort
  end

  # Seconds spent reading and tapping before submitting: a few seconds per question,
  # log-normal so most people are quick and a few take their time.
  def think_time(question_count, random)
    per_question = Math.exp(Math.log(4.0) + 0.45 * gaussian(random))
    (question_count * per_question).clamp(question_count * 1.2, question_count * 15.0)
  end

  def gaussian(random)
    Math.sqrt(-2 * Math.log(1 - random.rand)) * Math.cos(2 * Math::PI * random.rand)
  end

  def plan(count:, questions:, window:, abandon_rate:, skip_rate:, random:)
    popular = popularity(questions, random)
    arrival_times(count, window: window, random: random).each_with_index.map do |opens_at, index|
      Person.new(
        number: index + 1,
        opens_at: opens_at,
        think_seconds: think_time(questions.size, random),
        abandons: random.rand < abandon_rate,
        answers: choose_answers(questions, popular, random, skip_rate: skip_rate)
      )
    end
  end

  # A phone: keeps its own cookies (the voter token and the session the form token belongs to).
  class Phone
    class Failed < StandardError; end

    USER_AGENTS = [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
    ].freeze

    def initialize(base_url, random)
      @base_uri = URI(base_url)
      @cookies = {}
      @user_agent = USER_AGENTS.sample(random: random)
    end

    def open_page(slug)
      response = request(Net::HTTP::Get.new(uri("/#{slug}")))
      raise Failed, "GET /#{slug} returned #{response.code}" unless response.is_a?(Net::HTTPSuccess)
      response.body
    end

    def submit(slug, token, answers)
      post = Net::HTTP::Post.new(uri("/#{slug}/ballot"))
      post.set_form([["authenticity_token", token]] + answers.flat_map { |field, ids| ids.map { |id| [field, id.to_s] } })
      response = request(post)
      raise Failed, "POST /#{slug}/ballot returned #{response.code}" unless response.is_a?(Net::HTTPRedirection) || response.is_a?(Net::HTTPSuccess)
    end

    private

    def uri(path)
      @base_uri.dup.tap { |u| u.path = "#{@base_uri.path.chomp("/")}#{path}" }
    end

    def request(http_request)
      http_request["User-Agent"] = @user_agent
      http_request["Cookie"] = @cookies.map { |name, value| "#{name}=#{value}" }.join("; ") if @cookies.any?
      response = Net::HTTP.start(http_request.uri.host, http_request.uri.port, use_ssl: http_request.uri.scheme == "https",
        open_timeout: 10, read_timeout: 20) { |http| http.request(http_request) }
      Array(response.get_fields("set-cookie")).each do |cookie|
        name, value = cookie.split(";", 2).first.split("=", 2)
        @cookies[name] = value
      end
      response
    end
  end
end
