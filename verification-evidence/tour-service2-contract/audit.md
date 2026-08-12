# Tour Service2 contract audit

- Started: 2026-08-12T04:32:23.742Z
- Completed: 2026-08-12T04:32:33.146Z
- Busan region code: 26
- Shopping sample enabled: no
- Detailed records: 49/60
- Actual provider calls: 185/240
- Provider concurrency: 3/3
- Per-request timeout: 8000 ms; retry count: 0
- Visibility pages: 14/20; complete: true

## Summary

| metric | count |
|---|---:|
| recordsInspected | 49 |
| exposed | 49 |
| notExposed | 0 |
| unknownVisibility | 0 |
| visibilityProviderUnavailable | 0 |
| usablePetDetail | 0 |
| partialPetDetail | 49 |
| emptyPetDetail | 0 |
| absentPetDetail | 0 |
| petDetailProviderUnavailable | 0 |
| providerErrors | 0 |
| routeEligible | 7 |

## Detailed records

| contentId | type | visibility | pet detail | parser | Phase 3 | route eligible | reason |
|---|---|---|---|---|---|---|---|
| 126078 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 126079 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 126080 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 126081 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 126119 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 126122 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 126644 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required, outside_requested_geographic_scope |
| 126658 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 126674 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 126799 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 126848 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 127925 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 128108 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 128829 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 1338947 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 1607440 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 1887866 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required, outside_requested_geographic_scope |
| 1918646 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required, outside_requested_geographic_scope |
| 1997221 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 2504464 | 12 | exposed | partial | success | conditional/complete | yes | - |
| 252561 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 2606204 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 2661446 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 2663155 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 2672393 | 12 | exposed | partial | success | conditional/complete | yes | - |
| 2729918 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 2862152 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required, pet_size_verification_required, pet_type_verification_required |
| 3426656 | 12 | exposed | partial | success | allowed/complete | yes | - |
| 769761 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required, operating_time_conflict |
| 987810 | 12 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 2385666 | 14 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 2381567 | 28 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 2557807 | 28 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 3112126 | 28 | exposed | partial | success | conditional/complete | yes | - |
| 2622984 | 32 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 2663616 | 32 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required |
| 2699563 | 32 | exposed | partial | success | allowed/complete | yes | - |
| 2705418 | 32 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required, pet_size_verification_required, pet_type_verification_required |
| 2754601 | 32 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required, pet_type_incompatible |
| 2807380 | 39 | exposed | partial | success | conditional/complete | no | mandatory_condition_verification_required, outside_requested_geographic_scope, pet_size_verification_required |
| 3350880 | 39 | exposed | partial | success | conditional/complete | yes | - |
| 3438936 | 39 | exposed | partial | success | conditional/complete | yes | - |
| 3443614 | 39 | exposed | partial | success | allowed/complete | no | operating_time_conflict |
| 132786 | 38 | exposed | partial | success | conditional/complete | no | category_not_selected, outside_requested_geographic_scope, shopping_not_explicitly_selected |
| 2927087 | 38 | exposed | partial | success | allowed/complete | no | category_not_selected, operating_time_conflict, outside_requested_geographic_scope, shopping_not_explicitly_selected |
| 2930927 | 38 | exposed | partial | success | allowed/complete | no | category_not_selected, shopping_not_explicitly_selected |
| 4008098 | 38 | exposed | partial | success | allowed/complete | no | category_not_selected, shopping_not_explicitly_selected |
| 4008808 | 38 | exposed | partial | success | allowed/complete | no | category_not_selected, outside_requested_geographic_scope, shopping_not_explicitly_selected |
| 4012773 | 38 | exposed | partial | success | allowed/complete | no | category_not_selected, outside_requested_geographic_scope, shopping_not_explicitly_selected |

## Provider-support cases

Exposed records with an absent or present-but-empty pet-detail item: 0.
See `provider-support.md` for the sanitized support table.

