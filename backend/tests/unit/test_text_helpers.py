from email import message_from_bytes
from email.policy import default
from types import SimpleNamespace

import pytest

from app.services.delegations import episode_spans
from app.services.editor_notices import build_message, work_html, work_text
from app.services.exporters._common import fmt_dur, safe_filename
from app.services.insights import ep_list
from app.services.society_mail import clean_attachments, clean_emails, fill, join_emails, split_emails


@pytest.mark.parametrize("text,spans", [
    (None, []), ("", []), ("1-30", [(1, 30)]), ("30-1", [(1, 30)]), ("1-30, 35", [(1, 30), (35, 35)]),
    ("Ep 601–800", [(601, 800)]), ("5 to 7", [(5, 7)]),
])
def test_episode_spans(text, spans):
    assert episode_spans(text) == spans


@pytest.mark.parametrize("nums,out", [([], ""), ([3], "Ep 3"), ([1, 2, 3, 5], "Ep 1–3, 5"), ([5, 1, 2], "Ep 1–2, 5")])
def test_ep_list(nums, out):
    assert ep_list(nums) == out


def test_split_and_join_emails():
    assert split_emails(" a@b.c; d@e.f ,, ") == ["a@b.c", "d@e.f"]
    assert split_emails(None) == []
    assert join_emails(["a@b.c", "d@e.f"]) == "a@b.c, d@e.f"


def test_clean_emails_rejects_garbage_and_header_tricks():
    assert clean_emails(["A@B.co"], "To")
    for bad in ("not-an-email", "a@b.c\r\nBcc: evil@x.test"):
        with pytest.raises(Exception):
            clean_emails([bad], "To")


def test_clean_attachments_rejects_unknown():
    assert clean_attachments(["iprs"]) == ["iprs"]
    with pytest.raises(Exception):
        clean_attachments(["../../etc/passwd"])


def test_fill_keeps_unknown_placeholders_and_survives_stray_braces():
    assert fill("{serial} {nope}", {"serial": "Kothha"}) == "Kothha {nope}"
    assert fill("{oops", {"serial": "x"}) == "{oops"


def test_safe_filename_strips_everything_risky():
    assert safe_filename('a"b\r\nSet-Cookie: x/../y') == "a_b_Set-Cookie_x_.._y"
    assert safe_filename("कोठा") == "file"


@pytest.mark.parametrize("sec,out", [(None, "00:00:00"), (0, "00:00:00"), (65, "00:01:05"), (3661, "01:01:01")])
def test_fmt_dur(sec, out):
    assert fmt_dur(sec) == out


WORK = [{"project_id": 1, "client": "Sun <b>", "title": "Kothha <script>", "to_do": 2, "rejected": 1, "changes": 0, "overdue": 1,
         "to_do_eps": "Ep 1–2", "rejected_eps": "Ep 3", "changes_eps": "", "overdue_eps": "Ep 3",
         "notes": [{"episode": 3, "status": "rejected", "note": "<img src=x onerror=alert(1)>"}]}]


def test_notice_list_html_is_escaped():
    html = work_html(WORK)
    for raw in ("<script>", "<img", "Sun <b>"):
        assert raw not in html
    assert "&lt;script&gt;" in html and "Sun &lt;b&gt;" in html


def test_notice_text_lists_episodes_and_notes():
    text = work_text(WORK)
    assert "Ep 1–2" in text and "Ep 3" in text and "<img" in text
    assert work_text([]) == "" and work_html([]) == ""


def test_notice_message_escapes_body_and_uses_sender_mailbox():
    sender = SimpleNamespace(full_name="Asha, WD")
    mailbox = SimpleNamespace(email="asha@gmail.com")
    editor = SimpleNamespace(id=9, full_name="Esha", email="esha@example.test")
    msg = message_from_bytes(build_message(sender, mailbox, editor, "Pending", "<script>x</script>", WORK), policy=default)
    assert msg["From"] == '"Asha, WD" <asha@gmail.com>' and "esha@example.test" in msg["To"]
    assert "<script>x" not in msg.get_body(preferencelist=("html",)).get_content()
    assert "<script>x" in msg.get_body(preferencelist=("plain",)).get_content()


def test_notice_header_injection_is_refused():
    sender = SimpleNamespace(full_name="A")
    mailbox = SimpleNamespace(email="a@gmail.com")
    editor = SimpleNamespace(id=1, full_name="E", email="e@example.test")
    with pytest.raises(ValueError):
        build_message(sender, mailbox, editor, "Hi\r\nBcc: evil@x.test", "m", [])
