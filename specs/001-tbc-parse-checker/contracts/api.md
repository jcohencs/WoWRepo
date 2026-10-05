# API Contract

All responses are JSON. Errors: `{ "error": { "code": string, "message": string } }` with
4xx/5xx status. Codes: `bad_request`, `not_found`, `upstream`, `rate_limited`.

## GET /api/meta
→ `{ site: "fresh"|"classic", demo: boolean, raids: Raid[] }` (one entry per raid instance, progression order)

## GET /api/realms?region=US
→ `Realm[]` sorted by name.

## GET /api/character?region=US&realm=dreamscythe&name=Foo&raid=1011-black-temple
→ `ZoneReport`. `raid` optional (defaults to the latest TBC raid).

## GET /api/compare?region=US&realm=dreamscythe&name=Foo&encounter=601&spec=Fury
→ `Comparison`. 404 `not_found` if the character has no kill on the encounter.
