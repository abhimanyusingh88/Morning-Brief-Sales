/**
 * Switches a transaction to one person's row-level security identity in a single statement (one round trip, where
 * three separate statements cost three). The profile's sign-in identity is read first, while the transaction still
 * has its opening role; the claims are set next and the role is dropped to `authenticated` last, so nothing in this
 * statement runs with reduced rights before the identity it needs is in place. $1 is the profile id.
 */
export const AS_USER_SQL =
  'with who as materialized (select coalesce((select auth_user_id::text from profiles where id=$1 and is_active), $1::text) sub) ' +
  "select set_config('request.jwt.claims', json_build_object('sub', sub, 'role', 'authenticated')::text, true), " +
  "set_config('role', 'authenticated', true) from who";
