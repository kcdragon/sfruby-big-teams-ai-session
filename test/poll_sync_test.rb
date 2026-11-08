require "minitest/autorun"
require "stringio"
require_relative "../lib/poll_sync"

class PollSyncTest < Minitest::Test
  class FakeClient
    attr_reader :applied

    def initialize(existing_poll)
      @existing_poll = existing_poll
      @applied = []
    end

    def fetch_poll(_slug) = @existing_poll

    def apply(change)
      @applied << change
      {}
    end

    def delete_poll(slug)
      @applied << PollSync::Change.new(http_method: :delete, path: "/#{slug}")
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

  # Shaped like results.json, which ranks options by votes.
  def matching_poll
    {
      "slug" => "sfruby", "title" => "What is the room using?", "voter_count" => 0,
      "questions" => [
        {"id" => 1, "prompt" => "How many engineers?", "allows_multiple" => false,
         "options" => [{"id" => 12, "label" => "Many", "votes" => 3}, {"id" => 11, "label" => "Few", "votes" => 1}]},
        {"id" => 2, "prompt" => "Which agents?", "allows_multiple" => true,
         "options" => [{"id" => 21, "label" => "Claude Code", "votes" => 0}, {"id" => 22, "label" => "Cursor", "votes" => 0}]}
      ]
    }
  end

  def change_for(existing_poll)
    PollSync::Planner.new(definition: definition, existing_poll: existing_poll).change
  end

  def test_matching_poll_needs_no_change_even_when_options_are_ranked
    assert_nil change_for(matching_poll)
  end

  def test_missing_poll_is_created_in_one_request
    change = change_for(nil)

    assert_equal [:post, "/"], [change.http_method, change.path]
    assert_equal "sfruby", change.body[:poll][:slug]
    assert_equal "What is the room using?", change.body[:poll][:title]
    assert_equal [
      {prompt: "How many engineers?", allows_multiple: false, options: ["Few", "Many"]},
      {prompt: "Which agents?", allows_multiple: true, options: ["Claude Code", "Cursor"]}
    ], change.body[:poll][:questions]
  end

  def test_changed_poll_is_replaced_with_the_full_definition
    poll = matching_poll
    poll["questions"][0]["prompt"] = "Old wording"
    poll["questions"][1]["options"] << {"id" => 23, "label" => "Leftover", "votes" => 0}
    poll["questions"] << {"id" => 3, "prompt" => "Stale", "allows_multiple" => false, "options" => []}

    change = change_for(poll)

    assert_equal [:patch, "/sfruby"], [change.http_method, change.path]
    assert_equal 2, change.body[:poll][:questions].size
    assert_equal [
      "Question 1 prompt: Old wording -> How many engineers?",
      "Question 2 remove option: Leftover",
      "Remove question 3: Stale"
    ], change.summary
  end

  def test_title_change_alone_is_sent
    poll = matching_poll
    poll["title"] = "Old title"

    assert_equal ["Rename poll: Old title -> What is the room using?"], change_for(poll).summary
  end

  def test_dry_run_sends_nothing
    client = FakeClient.new(nil)

    PollSync.run(definition: definition, client: client, apply: false, output: StringIO.new)

    assert_empty client.applied
  end

  def test_apply_sends_the_change
    client = FakeClient.new(nil)

    PollSync.run(definition: definition, client: client, apply: true, output: StringIO.new)

    assert_equal [[:post, "/"]], client.applied.map { |change| [change.http_method, change.path] }
  end

  def test_warns_when_votes_would_block_question_changes
    poll = matching_poll
    poll["voter_count"] = 4
    poll["questions"][0]["prompt"] = "Old wording"
    output = StringIO.new

    PollSync.run(definition: definition, client: FakeClient.new(poll), apply: false, output: output)

    assert_includes output.string, "4 people have voted"
  end

  def test_reset_deletes_then_creates_the_poll
    client = FakeClient.new(matching_poll)

    PollSync.reset(definition: definition, client: client, output: StringIO.new)

    assert_equal [[:delete, "/sfruby"], [:post, "/"]], client.applied.map { |change| [change.http_method, change.path] }
  end
end
