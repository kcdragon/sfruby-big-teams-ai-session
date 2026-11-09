require "minitest/autorun"
require_relative "../lib/vote_simulator"

class VoteSimulatorTest < Minitest::Test
  def page(type)
    <<~HTML
      <p>Question 4 of 6</p>
      <form class="poll-answer-form" data-poll-answer-form="true" action="/sfruby/answers" accept-charset="UTF-8" method="post">
      <input type="hidden" name="authenticity_token" value="abc123" />
      <input type="hidden" name="question_id" id="question_id" value="11" />
      <input type="#{type}" name="option_ids[]" value="54"><input type="#{type}" name="option_ids[]" value="55">
      <input type="#{type}" name="option_ids[]" value="56">
      </form>
    HTML
  end

  def test_reads_the_current_question_form
    form = VoteSimulator.parse_form(page("checkbox"))
    assert_equal ["/sfruby/answers", "abc123", 11, 4, [54, 55, 56], true], [form.action, form.token, form.question_id, form.position, form.option_ids, form.multiple]
    refute VoteSimulator.parse_form(page("radio")).multiple
  end

  def test_the_waiting_screen_has_no_form
    assert_nil VoteSimulator.parse_form("<h1>Look up at the screen</h1><p>The next question will show up here.</p>")
  end

  def test_single_choice_picks_one_and_multiple_choice_never_repeats
    random = Random.new(2)
    single = VoteSimulator.parse_form(page("radio"))
    multiple = VoteSimulator.parse_form(page("checkbox"))
    weights = VoteSimulator.popularity(single.option_ids, random)
    200.times do
      assert_equal 1, VoteSimulator.pick_options(single, weights, random).size
      picks = VoteSimulator.pick_options(multiple, weights, random)
      assert_equal picks.uniq, picks
      assert picks.all? { |id| [54, 55, 56].include?(id) }
    end
  end

  def test_the_room_leans_toward_a_favourite
    random = Random.new(3)
    form = VoteSimulator::Form.new(option_ids: (1..8).to_a, multiple: false)
    weights = VoteSimulator.popularity(form.option_ids, random)
    picks = Array.new(1000) { VoteSimulator.pick_options(form, weights, random).first }.tally
    assert_operator picks.values.max, :>, picks.values.min * 3
  end

  def test_arrivals_are_front_loaded_and_stay_in_the_window
    times = VoteSimulator.arrival_times(2000, window: 100, random: Random.new(1))
    assert times.all? { |t| t.between?(0, 100) }
    assert_operator times.count { |t| t < 25 }, :>, times.count { |t| t >= 75 } * 4
  end

  def test_most_people_tap_within_ten_seconds
    random = Random.new(5)
    times = Array.new(2000) { VoteSimulator.reaction_time(random) }
    assert times.all? { |t| t.between?(1.5, 40) }
    assert_operator times.count { |t| t < 10 }, :>, 1600
  end
end
