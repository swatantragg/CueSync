# CueSync backend tests

Unit tests need nothing. Integration tests need a throwaway Postgres; they drop everything in it.

    docker run -d --name cuesync-test-pg -e POSTGRES_PASSWORD=t -p 127.0.0.1:55432:5432 postgres:16-alpine
    pip install -r requirements-dev.txt
    pytest

`TEST_DATABASE_URL` overrides the database. It must be on localhost: the suite refuses anything else, because
`backend/.env` points at production. Real `.env` files are not read, and all outside network calls (Google, Gmail,
Brevo) are blocked and answered by the `net` fixture.

`xfail` tests marked `known_issue` describe how the app should behave but doesn't yet. Fixing the issue makes the
test fail as "XPASS(strict)": then delete its marker.
