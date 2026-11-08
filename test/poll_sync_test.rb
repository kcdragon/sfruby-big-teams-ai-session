require "minitest/autorun"
require "stringio"
require_relative "../lib/poll_sync"

class PollSyncTest < Minitest::Test
  class FakeClient
    attr_reader :applied

    def initialize(existing_poll)
      @existing_poll = existing_poll
      @applied = []
      @next_id = 100
    end

    def fetch_poll(_slug) = @existing_poll

    def apply(change)
      @applied << change
      {"id" => (@next_id += 1)}
    end
  end

  def definition
    {
      "slug" => "sfruby",
      "title" => "What is the room using?",
      "questions" => [
        {"prompt" => "How many engineers?", "allows_multiple" => false, "options" => ["Few", "Many"]},
        {"prompt" => "Which agents?", "allows_multiple" => true, "options" => ["Claude Code", "Cursor"]}
      ]
    }
  end

  def matching_poll
    {
      "slug" => "sfruby", "title" => "What is the room using?",
      "questions" => [
        {"id" => 1, "prompt" => "How many engineers?", "allows_multiple" => false, "position" => 1,
         "options" => [{"id" => 11, "label" => "Few", "position" => 1}, {"id" => 12, "label" => "Many", "position" => 2}]},
        {"id" => 2, "prompt" => "Which agents?", "allows_multiple" => true, "position" => 2,
         "options" => [{"id" => 21, "label" => "Claude Code", "position" => 1}, {"id" => 22, "label" => "Cursor", "position" => 2}]}
      ]
    }
  end

  def plan(existing_poll)
    PollSync::Planner.new(definition: definition, existing_poll: existing_poll).changes
  end

  def test_matching_poll_needs_no_changes
    assert_empty plan(matching_poll)
  end

  def test_missing_poll_is_created_with_its_questions
    changes = plan(nil)

    assert_equal [:post, "/polls"], [changes[0].http_method, changes[0].path]
    assert_equal({poll: {slug: "sfruby", title: "What is the room using?"}}, changes[0].body)
    assert_equal ["/polls/sfruby/questions"] * 2, changes.drop(1).map(&:path)
    assert_equal [["Few", "Many"], ["Claude Code", "Cursor"]], changes.drop(1).map(&:follow_up_options)
    assert_equal [1, 2], changes.drop(1).map { |change| change.body[:question][:position] }
  end

  def test_reworded_question_is_updated_in_place
    poll = matching_poll
    poll["questions"][0]["prompt"] = "Old wording"

    changes = plan(poll)

    assert_equal 1, changes.size
    assert_equal :patch, changes[0].http_method
    assert_equal "/polls/sfruby/questions/1", changes[0].path
    assert_equal "How many engineers?", changes[0].body[:question][:prompt]
  end

  def test_options_are_added_updated_and_deleted_by_position
    poll = matching_poll
    poll["questions"][1]["options"] = [
      {"id" => 21, "label" => "Claude", "position" => 1},
      {"id" => 23, "label" => "Leftover", "position" => 3},
    ]

    changes = plan(poll)

    assert_equal(
      [[:patch, "/polls/sfruby/questions/2/options/21"], [:patch, "/polls/sfruby/questions/2/options/23"]],
      changes.map { |change| [change.http_method, change.path] }
    )
    assert_equal({option: {label: "Cursor", position: 2}}, changes[1].body)
  end

  def test_extra_questions_and_options_are_deleted
    poll = matching_poll
    poll["questions"][0]["options"] << {"id" => 13, "label" => "Lots", "position" => 3}
    poll["questions"] << {"id" => 3, "prompt" => "Stale", "allows_multiple" => false, "position" => 3, "options" => []}

    changes = plan(poll)

    assert_equal(
      [[:delete, "/polls/sfruby/questions/1/options/13"], [:delete, "/polls/sfruby/questions/3"]],
      changes.map { |change| [change.http_method, change.path] }
    )
  end

  def test_dry_run_sends_nothing
    client = FakeClient.new(nil)

    PollSync.run(definition: definition, client: client, apply: false, output: StringIO.new)

    assert_empty client.applied
  end

  def test_apply_creates_options_under_each_new_question
    client = FakeClient.new(nil)

    PollSync.run(definition: definition, client: client, apply: true, output: StringIO.new)

    option_paths = client.applied.select { |change| change.path.end_with?("/options") }.map(&:path)
    assert_equal ["/polls/sfruby/questions/102/options"] * 2 + ["/polls/sfruby/questions/105/options"] * 2, option_paths
  end
end
