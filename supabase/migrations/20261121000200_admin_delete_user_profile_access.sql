-- The admin-delete-user Edge Function uses the service-role client to verify
-- the requesting administrator before deleting an Auth user. Keep this grant
-- limited to reading profile rows; authorization is still checked in the function.
grant usage on schema public to service_role;
grant select on table public.users to service_role;
