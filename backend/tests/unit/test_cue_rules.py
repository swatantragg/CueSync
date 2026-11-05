from types import SimpleNamespace

import pytest

from app.services.cue_rules import apply_share_rules, computed_share, cue_sort_key, iprs_role_code, role_key, sorted_cues, usage_code, usage_value_from_code
from app.services.validator import validate_episode


@pytest.mark.parametrize("raw,key", [("Composer", "Composer"), ("composer ", "Composer"), ("AUTHOR", "Author"), ("Publisher", "Publisher")])
def test_role_key_normalises(raw, key):
    assert role_key(raw) == key


def test_unknown_or_empty_role_does_not_crash():
    assert role_key(None) is not None
    assert iprs_role_code("Composer") == "C"
    assert iprs_role_code("Author") == "A"


def test_share_rules_add_up_to_100():
    people = [{"name": "C", "role": "Composer", "share_percent": 0}, {"name": "A", "role": "Author", "share_percent": 0},
              {"name": "P", "role": "Publisher", "share_percent": 0}]
    out = apply_share_rules(people)
    total = sum(p["share_percent"] for p in out)
    assert total == pytest.approx(100, abs=0.05)


def test_computed_share_never_negative():
    c = SimpleNamespace(role="Composer", share_percent=50)
    assert computed_share(c, [c]) >= 0


def test_usage_code_round_trip_for_every_known_code():
    from app.models.cue import UsageType
    for u in UsageType:
        assert usage_code(u) is not None


def test_usage_value_from_unknown_code_is_safe():
    assert usage_value_from_code(None) is not None
    assert usage_value_from_code("??") is not None


def test_sorted_cues_is_stable_on_order_index():
    a, b = SimpleNamespace(order_index=2, id=1, time_in=None), SimpleNamespace(order_index=1, id=2, time_in=None)
    assert [c.id for c in sorted_cues([a, b])] == [2, 1]


def _cue(**kw):
    base = dict(id=1, isrc="X", work_number="Y", ascap_work_id="Z", contributors=[])
    return SimpleNamespace(**{**base, **kw})


def test_validator_flags_cue_without_contributors():
    out = validate_episode(SimpleNamespace(id=1, cues=[_cue()]))
    assert not out["ok"] and any(i["type"] == "no_contributors" for i in out["issues"])


def test_validator_flags_wrong_share_total_and_missing_ids():
    people = [SimpleNamespace(role="Composer", share_percent=10, name="C")]
    out = validate_episode(SimpleNamespace(id=1, cues=[_cue(contributors=people, isrc=None)]))
    kinds = {i["type"] for i in out["issues"]}
    assert "missing_iprs" in kinds and "missing_share_role" in kinds


def test_validator_passes_an_empty_episode():
    assert validate_episode(SimpleNamespace(id=1, cues=[]))["ok"]
