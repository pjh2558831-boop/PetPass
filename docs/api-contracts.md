# API contracts

All Route Handlers use an envelope:

```ts
type ApiResult<T> =
  | { ok: true; data: T; requestId: string }
  | {
      ok: false;
      error: {
        code:
          | "CONFIGURATION_REQUIRED"
          | "UPSTREAM_ERROR"
          | "INVALID_RESPONSE"
          | "INVALID_REQUEST";
        message: string;
        retryable: boolean;
      };
      requestId: string;
    };
```

## `GET /api/tour`

Query:

- `operation`: allowlisted KorPetTourService2 operation.
- Remaining query values are forwarded after server-owned `serviceKey`,
  `MobileOS`, `MobileApp`, and `_type` values are added.

The service key is never accepted from or returned to the browser. The upstream
JSON body is validated before success.

## `GET /api/geocode`

Query: `address`. Uses the server-only Kakao REST key and returns validated
address documents with address text, longitude, and latitude.

## `GET /api/directions`

Query: `originLat`, `originLng`, `destinationLat`, `destinationLng`. Coordinates
are range-validated. Kakao Mobility remains responsible for road distance and
duration.

## `GET /api/licenses`

Query: `businessName`, `address`, and `category` (`RESTAURANT` or
`ACCOMMODATION`). This boundary returns a configuration error until the exact
administrative dataset and endpoint are selected.

`NO_MATCH` means only that a sufficiently strong match was not found. Clients
must not describe the business as illegal or unlicensed.

## Error behavior

Missing configuration returns 503 and never falls back to demo data. Invalid
input returns 400. Invalid or failing upstream responses return 502 with a
retryable flag.
