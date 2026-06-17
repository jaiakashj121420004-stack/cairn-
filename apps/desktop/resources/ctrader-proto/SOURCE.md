# Vendored cTrader Open API protobuf schema

These `.proto` files are the **Spotware Open API** message schema, vendored verbatim
so the cTrader live-broker codec can compile them at runtime with `protobufjs`
(`docs/broker-integration.md` §2.2). They are **never fetched at runtime** — the
bundled copy is the only source, so the build is reproducible and offline.

## Upstream

- **Repository:** https://github.com/spotware/openapi-proto-messages
- **Branch:** `main`
- **Commit:** `3fd8bddfbe0cfc2ecfda079623dc4e498af11e66` ("Fix typo in modelmessages", 2025-11-13)
- **Raw URL pattern:** `https://raw.githubusercontent.com/spotware/openapi-proto-messages/<commit>/<file>`
- **License:** MIT — © 2021 Spotware. Full text in `LICENSE` (vendored alongside).

## Files (verbatim, unmodified)

| File | Purpose | sha256 |
|---|---|---|
| `OpenApiCommonMessages.proto` | `ProtoMessage` envelope, `ProtoErrorRes`, `ProtoHeartbeatEvent` | `9816cd24b340dcc4eb28548eb4dd16735995d2a61889337591e5c4d8021652a2` |
| `OpenApiCommonModelMessages.proto` | `ProtoPayloadType`, `ProtoErrorCode` | `b95d7df670a7e890a53ec08f676198ace7bb0a074a4b07ff0b493c4be00a0dea` |
| `OpenApiModelMessages.proto` | `ProtoOAPayloadType` + OA model messages/enums (`ProtoOAPosition`, `ProtoOADeal`, `ProtoOATradeData`, `ProtoOAClosePositionDetail`, `ProtoOALightSymbol`, …) | `56338dcac45a149227678b7c23637d64f4e2b607f6649af82394ce5c0957fedf` |
| `OpenApiMessages.proto` | OA request/response messages (`ProtoOAExecutionEvent`, `ProtoOASymbolsListRes`, `ProtoOAApplicationAuthReq/Res`, `ProtoOAAccountAuthReq/Res`, …) | `a84df9b528e69a494e197d48e21d6291b3d76db31396663a8188721eef9fcf35` |

## Read-only boundary (CLAUDE.md §14 #37)

The schema *defines* the full Open API surface, including order-execution requests
(`ProtoOANewOrderReq`, `ProtoOAAmendOrderReq`, `ProtoOAClosePositionReq`, …). That is
expected — defining a message type is not the same as being able to send it. The
read-only boundary is enforced **in the codec, not the schema**: `codec.ts` builds its
send (encode) lookup table from an explicit allowlist of auth/read/heartbeat payload
types only, so no order-execution message can be encoded or sent. `ctrader-readonly.test.ts`
asserts this on the send path.

## Updating

To refresh against a newer upstream commit:

1. Re-download the four files at the new commit from the raw URL above (verbatim — do
   not edit them).
2. Update the commit hash and the sha256 table here.
3. Run `apps/desktop/tests/unit/broker/ctrader-codec.test.ts`; if Spotware renamed a
   field or message Cairn reads, the decode fixtures will fail and `messages.ts`/`codec.ts`
   need the matching update.
