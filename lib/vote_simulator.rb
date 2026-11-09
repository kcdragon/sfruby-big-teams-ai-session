require "json"
require "net/http"
require "uri"

# Simulates phones answering the poll's open question: each one opens the page, reads,
# and taps a few seconds later, the way people do: most quickly, some slowly.
module VoteSimulator
  # The answer form for the current question, read from the phone page.
  # position is the question's place in the poll, from the page's "Question N of M".
  Form = Struct.new(:action, :token, :question_id, :position, :option_ids, :multiple, keyword_init: true)

  module_function

  # Returns nil on the waiting screen (no question open).
  def parse_form(html)
    form = html[%r{<form\b[^>]*action="[^"]*/answers"[^>]*>.*?</form>}m] or return nil
    inputs = form.scan(/<input\b[^>]*>/)
    options = inputs.filter_map do |tag|
      type = tag[/type="(radio|checkbox)"/, 1] or next
      next unless tag.include?('name="option_ids[]"')
      [tag[/value="(\d+)"/, 1].to_i, type == "checkbox"]
    end
    question_id = inputs.find { |tag| tag.include?('name="question_id"') }.to_s[/value="(\d+)"/, 1]
    return nil if options.empty? || question_id.nil?

    Form.new(
      action: form[/action="([^"]+)"/, 1],
      token: form[/name="authenticity_token" value="([^"]+)"/, 1],
      question_id: question_id.to_i,
      position: html[/Question (\d+) of \d+/, 1]&.to_i,
      option_ids: options.map(&:first),
      multiple: options.first.last
    )
  end

  # Each question gets a fixed popularity per option, so the room leans the same way
  # a real one does instead of spreading evenly. Weights fall off roughly like 1/rank.
  def popularity(option_ids, random)
    option_ids.shuffle(random: random).each_with_index.to_h do |option_id, rank|
      [option_id, 1.0 / (rank + 1)**1.1 * (0.6 + random.rand)]
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

  # One person's picks for a question: one option, or a few for multiple choice.
  def pick_options(form, weights, random)
    remaining = weights.dup
    count = form.multiple ? [1, 1, 2, 2, 2, 3, 3, 4].sample(random: random) : 1
    Array.new([count, remaining.size].min) { weighted_pick(remaining, random).tap { |id| remaining.delete(id) } }
  end

  # Seconds from a question appearing to the first tap: read it, think, tap. Log-normal
  # around 5 seconds, so most people are quick and a few take a while.
  def reaction_time(random)
    Math.exp(Math.log(5.0) + 0.55 * gaussian(random)).clamp(1.5, 40.0)
  end

  def gaussian(random)
    Math.sqrt(-2 * Math.log(1 - random.rand)) * Math.cos(2 * Math::PI * random.rand)
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

    # Posts the full set of chosen options, as the page's JavaScript does.
    # Returns :saved, or :too_late when the presenter had already moved on.
    def answer(form, option_ids)
      post = Net::HTTP::Post.new(uri(URI(form.action).path))
      post["Accept"] = "application/json"
      post.set_form([["authenticity_token", form.token], ["question_id", form.question_id.to_s]] +
        option_ids.map { |id| ["option_ids[]", id.to_s] })
      response = request(post)
      return :saved if response.is_a?(Net::HTTPSuccess)
      return :too_late if response.code == "409"
      raise Failed, "POST #{form.action} returned #{response.code}"
    end

    private

    def uri(path)
      @base_uri.dup.tap { |u| u.path = path.start_with?(@base_uri.path.chomp("/")) ? path : "#{@base_uri.path.chomp("/")}#{path}" }
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
