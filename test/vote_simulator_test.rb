require "minitest/autorun"
require_relative "../lib/vote_simulator"

class VoteSimulatorTest < Minitest::Test
  PAGE = <<~HTML
    <form class="poll-shell" action="/sfruby/ballot" accept-charset="UTF-8" method="post">
    <input type="hidden" name="authenticity_token" value="abc123" />
    <input type="radio" name="selections[8][]" value="41"><input type="radio" name="selections[8][]" value="42">
    <input type="checkbox" name="selections[11][]" value="54"><input type="checkbox" name="selections[11][]" value="55">
    <input type="checkbox" name="selections[11][]" value="56"><input type="submit" value="Vote">
    </form>
  HTML

  def questions = VoteSimulator.parse_questions(PAGE)

  def test_reads_questions_and_token_from_the_form
    assert_equal [[8, [41, 42], false], [11, [54, 55, 56], true]], questions.map { |q| [q.id, q.option_ids, q.multiple] }
    assert_equal "selections[8][]", questions.first.field
    assert_equal "abc123", VoteSimulator.authenticity_token(PAGE)
  end

  def test_arrivals_are_front_loaded_and_stay_in_the_window
    times = VoteSimulator.arrival_times(2000, window: 100, random: Random.new(1))
    assert times.all? { |t| t.between?(0, 100) }
    assert_operator times.count { |t| t < 25 }, :>, times.count { |t| t >= 75 } * 4
  end

  def test_single_choice_gets_one_answer_and_multiple_choice_never_repeats
    random = Random.new(2)
    popular = VoteSimulator.popularity(questions, random)
    200.times do
      answers = VoteSimulator.choose_answers(questions, popular, random, skip_rate: 0)
      assert_equal 1, answers["selections[8][]"].size
      assert_equal answers["selections[11][]"].uniq, answers["selections[11][]"]
      assert answers["selections[11][]"].all? { |id| [54, 55, 56].include?(id) }
    end
  end

  def test_the_room_leans_toward_a_favourite
    random = Random.new(3)
    many = [VoteSimulator::Question.new(id: 1, field: "f", option_ids: (1..8).to_a, multiple: false)]
    popular = VoteSimulator.popularity(many, random)
    picks = Array.new(1000) { VoteSimulator.choose_answers(many, popular, random, skip_rate: 0)["f"].first }.tally
    assert_operator picks.values.max, :>, picks.values.min * 3
  end

  def test_plan_marks_some_people_as_leaving_and_spaces_out_their_votes
    people = VoteSimulator.plan(count: 500, questions: questions, window: 60, abandon_rate: 0.2, skip_rate: 0.1, random: Random.new(4))
    assert_equal (1..500).to_a, people.map(&:number)
    assert_in_delta 100, people.count(&:abandons), 30
    assert people.all? { |p| p.think_seconds.between?(2.4, 30) }
  end
end
