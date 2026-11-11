import json

import pytest

from prosody.text import CATEGORICAL, N_NUMERIC, ROOT, Phrase, Word, featurize, load_cmudict, split_phrases, to_utterance


@pytest.fixture(scope="module")
def cmudict():
    return load_cmudict()


def test_phrases_split_at_punctuation_and_know_how_they_end():
    assert split_phrases("Well, that's it. Is it? Yes; no: maybe!") == [
        (["well"], "comma"), (["that's", "it"], "final"), (["is", "it"], "question"), (["yes"], "comma"), (["no"], "comma"), (["maybe"], "final"),
    ]
    assert split_phrases("no punctuation") == [(["no", "punctuation"], "final")]


def test_utterance_has_each_words_stresses(cmudict):
    utt = to_utterance("Tomorrow, the banana.", cmudict)
    assert [(w.text, w.stresses) for p in utt for w in p.words] == [("tomorrow", [0, 1, 2]), ("the", [0]), ("banana", [0, 1, 0])]
    assert [p.end for p in utt] == ["comma", "final"]


def test_a_trailing_comma_ends_the_utterance(cmudict):
    assert to_utterance("and then,", cmudict)[-1].end == "final"


def test_an_unknown_word_drops_the_utterance(cmudict):
    assert to_utterance("The zxqvy sat.", cmudict) is None
    assert to_utterance("...", cmudict) is None


def test_features_have_the_shape_the_model_expects():
    utt = [Phrase([Word("the", [1]), Word("banana", [0, 1, 0])], "comma"), Phrase([Word("why", [1])], "question")]
    f = featurize(utt)
    assert len(f) == 5
    for s in f:
        assert len(s.cat) == len(CATEGORICAL) and len(s.num) == N_NUMERIC
        for v, (_, size) in zip(s.cat[1:], CATEGORICAL[1:]):
            assert 0 <= v < size
    # "the" is a function word: no stress, whatever the dictionary says
    assert f[0].cat[1] == 0 and f[0].cat[5] == 1
    # the nucleus is banana's stressed syllable; the last phrase follows a comma and opens with a wh-word
    assert [s.num[6] for s in f] == [0, 0, 1, 0, 1]
    assert f[4].cat[4] == 1 and f[4].cat[6] == 1 and f[4].cat[3] == 2


def test_the_shared_fixture_is_up_to_date(cmudict):
    """tests/unit/trained.test.ts checks the TypeScript features against this same file."""
    cases = json.loads((ROOT / "tests" / "fixtures" / "prosody-features.json").read_text())
    for c in cases:
        got = featurize(to_utterance(c["text"], cmudict))
        assert [s.cat for s in got] == [f["cat"] for f in c["features"]], c["text"]
        assert [[round(v, 6) for v in s.num] for s in got] == [f["num"] for f in c["features"]], c["text"]
