-- The database helper resolves auth.uid() through profiles.auth_user_id.
-- Local pilot identities have deterministic ids; an actual SSO mapping can replace these later.
update profiles set auth_user_id=id where auth_user_id is null and email in('sales1@pilot.invalid','sales2@pilot.invalid');
