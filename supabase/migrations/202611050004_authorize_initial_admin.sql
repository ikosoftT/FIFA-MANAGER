-- Project bootstrap: authorize the confirmed organizer created through Supabase Auth.
insert into private.admin_users(user_id)
values ('2e4cbbe9-0a57-4cb9-8719-f60d8840cafc'::uuid)
on conflict (user_id) do nothing;
