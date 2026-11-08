require "minitest/autorun"
require "tmpdir"
require_relative "../lib/poll_slides"

class PollSlidesTest < Minitest::Test
  def setup
    @dir = Dir.mktmpdir
    @slides = File.join(@dir, "slides")
    Dir.mkdir(@slides)
    @deck = File.join(@dir, "deck.json")
    File.write(@deck, JSON.generate("order" => %w[cover poll-vote open-mic thanks]))
    File.write(File.join(@slides, "poll-vote.html"), "<p>Answer 7 quick questions about your team.</p>")
    File.write(File.join(@slides, "open-mic.html"), "<section id=\"open-mic\"></section>")
  end

  def teardown = FileUtils.remove_entry(@dir)

  def build(questions)
    PollSlides.build(definition: {"slug" => "sfruby", "questions" => questions}, slides_dir: @slides, deck_path: @deck)
  end

  def order = JSON.parse(File.read(@deck))["order"]
  def slide(name) = File.read(File.join(@slides, "#{name}.html"))

  def question(prompt, **extra)
    {"prompt" => prompt, "allows_multiple" => false, "options" => %w[A B C]}.merge(extra.transform_keys(&:to_s))
  end

  def test_writes_one_slide_per_question_after_the_vote_slide
    build([question("First?"), question("Second?", chart: "bars", notes: "Say hi")])

    assert_equal %w[cover poll-vote poll-1 poll-2 open-mic thanks], order
    assert_includes slide("poll-1"), "LIVE POLL · 1 OF 2"
    assert_includes slide("poll-1"), 'data-poll-chart="columns"'
    assert_includes slide("poll-2"), "<aside>Say hi</aside>"
    refute_includes slide("poll-2"), "data-poll-chart"
    assert_includes slide("poll-vote"), "Answer 2 quick questions"
  end

  def test_rebuilding_with_fewer_questions_removes_the_extra_slides
    build([question("One?"), question("Two?"), question("Three?")])
    build([question("Only?")])

    assert_equal %w[cover poll-vote poll-1 open-mic thanks], order
    refute File.exist?(File.join(@slides, "poll-2.html"))
    assert File.exist?(File.join(@slides, "open-mic.html"))
    assert_includes slide("poll-vote"), "Answer 1 quick question about"
  end

  def test_cards_show_a_live_count_per_option
    cards = [{"title" => "ENGINEER", "icon" => "Code"}, {"title" => "FOUNDER"}, {"title" => "BUILDER", "text" => "Ships"}]
    build([question("Role?", chart: "cards", heading: "CHOOSE", cards: cards)])

    html = slide("poll-1")
    assert_equal 3, html.scan('data-poll="count"').size
    assert_includes html, 'data-poll-option="3"'
    assert_includes html, ">CHOOSE</h2>"
    refute_includes html, 'data-poll="prompt"'
  end

  def test_cards_must_match_the_options
    error = assert_raises(ArgumentError) { build([question("Role?", chart: "cards", cards: [{"title" => "X"}])]) }
    assert_match "3 options but 1 cards", error.message
  end

  def test_escapes_html_in_prompts
    build([question("Tabs <or> spaces?")])
    assert_includes slide("poll-1"), "TABS &lt;OR&gt; SPACES?"
  end
end
