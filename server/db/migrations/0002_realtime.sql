-- Live updates. When a payment, a notification or a payout is written, a small signal is broadcast on the public
-- channel "pb:events", so the three tabs can refresh at once. The signal carries ids and status only: no names,
-- no emails, no amounts. The app reads the details through the API.
-- A failed broadcast never blocks the write that caused it.

create function public.broadcast_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  changed jsonb := to_jsonb(new);
  signal jsonb;
begin
  signal := jsonb_strip_nulls(jsonb_build_object(
    'table', tg_table_name,
    'op', tg_op,
    'id', changed -> 'id',
    'merchantId', changed -> 'merchant_id',
    'buyerId', changed -> 'buyer_id',
    'status', changed -> 'status',
    'audience', changed -> 'audience',
    'kind', changed -> 'kind'
  ));
  begin
    perform realtime.send(signal, 'change', 'pb:events', false);
  exception when others then
    raise warning 'realtime broadcast failed: %', sqlerrm;
  end;
  return new;
end $$;

revoke all on function public.broadcast_change() from public;

create trigger payments_broadcast after insert or update on public.payments for each row execute function public.broadcast_change();
create trigger notifications_broadcast after insert on public.notifications for each row execute function public.broadcast_change();
create trigger payouts_broadcast after insert or update on public.payouts for each row execute function public.broadcast_change();
