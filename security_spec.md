# Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Default-Deny Catch-All**: Every path not explicitly matched is denied (`allow read, write: if false;`).
2. **Verified Authentication & Admin Bootstrap**: All writes require `isSignedIn()` and `request.auth.token.email_verified == true`. Admin status is verified via `exists(/databases/$(database)/documents/admins/$(request.auth.uid))` or verified runtime owner email (`mendozaissrael@gmail.com` with `email_verified == true`).
3. **Strict Owner & PII Isolation**: `memberships`, `exchange_settings`, `products`, and `chat_messages` contain business and client PII (`phone`, `cedula`, `firstName`, `lastName`). Every document requires `ownerId == request.auth.uid` on creation, immutability of `ownerId` and `createdAt` on update, and `allow get, list` strictly checks `resource.data.ownerId == request.auth.uid || isAdmin()`.
4. **Strict Key & Volumetric Validation (`isValid[Entity]`)**: Every `create` and `update` invokes `isValid[Entity](incoming())` checking `keys().hasAll(...)`, `keys().hasOnly(...)`, type safety, regex patterns, string length bounds (`minLength` / `maxLength`), and server timestamps (`request.time`).
5. **Action-Based Updates**: Every `allow update` wraps `isValid[Entity](incoming())` and partitions allowed changes into explicit action branches with `incoming().diff(existing()).affectedKeys().hasOnly(...)` plus immutable field checks (`ownerId`, `createdAt`).

## 2. The "Dirty Dozen" Payloads (Adversarial Test Cases)

1. **Payload 1 (Identity Spoofing on Membership Create)**: Authenticated user sets `ownerId: "victim-uid"` instead of `request.auth.uid`. -> `PERMISSION_DENIED`
2. **Payload 2 (Unverified Email Spoof)**: User has `email: "mendozaissrael@gmail.com"` but `email_verified: false`. -> `PERMISSION_DENIED`
3. **Payload 3 (Shadow Field Injection on Product Create)**: Payload includes extra ghost field `"isFeatured": true` not in `hasOnly`. -> `PERMISSION_DENIED`
4. **Payload 4 (Path ID Poisoning)**: Document ID contains illegal characters or exceeds 128 chars (`"bad$id!@#"`). -> `PERMISSION_DENIED`
5. **Payload 5 (Timestamp Forgery on Create)**: Client passes past/future timestamp instead of `request.time` for `createdAt`. -> `PERMISSION_DENIED`
6. **Payload 6 (Immutable Field Mutation on Update)**: Attempt to modify `createdAt` or `ownerId` during an update on `memberships`. -> `PERMISSION_DENIED`
7. **Payload 7 (Value Poisoning on Update)**: Attempt to update `status` on `memberships` to `"hacked_status"` outside the allowed enum `['pending_payment', 'awaiting_profile', 'active', 'expiring_soon', 'expired']`. -> `PERMISSION_DENIED`
8. **Payload 8 (Denial of Wallet String Overflow)**: Attempt to write a 10,000-character string into `chat_messages.text` (max 2000). -> `PERMISSION_DENIED`
9. **Payload 9 (Cross-Tenant PII Read / Get)**: User B attempts `get` on User A's `/memberships/{id}` containing phone and cedula. -> `PERMISSION_DENIED`
10. **Payload 10 (Unconstrained List Scraping)**: Authenticated user queries `/memberships` without filtering `where('ownerId', '==', uid)`. -> `PERMISSION_DENIED`
11. **Payload 11 (Self-Assigned Admin Escalation)**: Non-admin user attempts to create `/admins/{theirUid}` with an unverified or non-bootstrapped email. -> `PERMISSION_DENIED`
12. **Payload 12 (Negative Price / Invalid Numeric Bounds)**: Attempt to create a `Product` with `basePriceUsd: -50` or `stock: -10`. -> `PERMISSION_DENIED`
