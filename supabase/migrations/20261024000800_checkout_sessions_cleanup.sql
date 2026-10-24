-- Checkout sessions are only needed to match a payment webhook, which arrives within minutes.
-- The app deletes sessions older than 7 days each time a new checkout is created.
grant delete on public.checkout_sessions to service_role;
