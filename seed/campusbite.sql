-- =====================================================================
-- CampusBite: Campus Canteen Ordering Agent
-- SRM Agentic AI Workshop | Live demo seed data
-- Run this in Supabase -> SQL Editor.
-- It is ALSO the reset script: run it again before every rehearsal and
-- before the live session to get fresh stock, wallets and slots.
-- All names and data are made up.
-- =====================================================================

drop function if exists place_order(text, bigint, jsonb);
drop function if exists cancel_order(text, bigint);
drop table if exists order_items, orders, pickup_slots, wallets, menu_items cascade;

-- ---------------------------------------------------------------- tables
create table menu_items (
  id            bigint generated always as identity primary key,
  name          text not null,
  category      text not null check (category in ('meal', 'snack', 'drink', 'sweet')),
  price         int  not null check (price > 0),          -- in rupees
  is_veg        boolean not null,
  stock         int  not null check (stock >= 0),
  prep_minutes  int  not null default 10,
  description   text not null
);

create table wallets (
  student_id  text primary key,
  name        text not null,
  balance     int  not null check (balance >= 0)           -- in rupees
);

create table pickup_slots (
  id         bigint generated always as identity primary key,
  slot_time  time not null unique,                          -- today's pickup time
  capacity   int  not null,
  booked     int  not null default 0 check (booked >= 0)
);

create table orders (
  id          bigint generated always as identity primary key,
  student_id  text   not null references wallets(student_id),
  slot_id     bigint not null references pickup_slots(id),
  total       int    not null,
  status      text   not null default 'placed'
              check (status in ('placed', 'preparing', 'ready', 'collected', 'cancelled')),
  created_at  timestamptz not null default now()
);

create table order_items (
  id            bigint generated always as identity primary key,
  order_id      bigint not null references orders(id) on delete cascade,
  menu_item_id  bigint not null references menu_items(id),
  quantity      int    not null check (quantity > 0),
  price         int    not null                            -- price at the time of order
);

-- ---------------------------------------------------------------- data
insert into menu_items (name, category, price, is_veg, stock, prep_minutes, description) values
  ('Veg Meals',             'meal',  70, true,  40, 5,  'Rice, sambar, rasam, poriyal, curd and papad'),
  ('Masala Dosa',           'meal',  50, true,  25, 8,  'Crispy dosa with potato masala, chutney and sambar'),
  ('Idli Vada Combo',       'meal',  40, true,  30, 5,  '2 idlis and 1 medu vada with chutney and sambar'),
  ('Curd Rice',             'meal',  45, true,  20, 3,  'Curd rice with pickle'),
  ('Lemon Rice',            'meal',  45, true,  18, 3,  'Tangy lemon rice with peanuts'),
  ('Paneer Butter Masala with 2 Chapati', 'meal', 90, true, 0, 10, 'Paneer in rich tomato gravy with 2 chapatis'),
  ('Chicken Biryani',       'meal', 120, false,  2, 5,  'Chennai-style chicken biryani with raita'),
  ('Egg Fried Rice',        'meal',  80, false, 15, 10, 'Fried rice with scrambled egg and vegetables'),
  ('Parotta with Salna',    'meal',  60, false, 12, 8,  '2 parottas with chicken salna'),
  ('Samosa',                'snack', 15, true,  50, 2,  'Crispy potato samosa'),
  ('Veg Puff',              'snack', 20, true,  35, 2,  'Baked puff with spiced vegetables'),
  ('Bajji Plate',           'snack', 30, true,  20, 6,  'Raw banana and chilli bajji, 4 pieces'),
  ('Egg Puff',              'snack', 25, false, 15, 2,  'Baked puff with spiced egg'),
  ('Filter Coffee',         'drink', 20, true,  80, 2,  'South Indian filter coffee'),
  ('Masala Tea',            'drink', 15, true,  80, 2,  'Ginger and cardamom tea'),
  ('Fresh Lime Soda',       'drink', 30, true,  30, 3,  'Sweet or salt'),
  ('Buttermilk',            'drink', 15, true,  40, 1,  'Spiced chilled buttermilk'),
  ('Gulab Jamun (2 pcs)',   'sweet', 30, true,  25, 1,  'Soft gulab jamun in sugar syrup'),
  ('Payasam',               'sweet', 35, true,  15, 1,  'Vermicelli payasam'),
  ('Kesari',                'sweet', 25, true,  20, 1,  'Rava kesari with ghee and cashew');

insert into wallets (student_id, name, balance) values
  ('S001', 'Priya Ramesh',   150),   -- the demo student
  ('S002', 'Arun Kumar',     300),
  ('S003', 'Fathima Nazeer', 220),
  ('S004', 'Rahul Menon',    90),
  ('S005', 'Sneha Iyer',     500);

-- Today's pickup slots: 12:00 to 14:30 every 15 minutes, 10 orders each
insert into pickup_slots (slot_time, capacity)
select t::time, 10
from generate_series(timestamp '2000-01-01 12:00', timestamp '2000-01-01 14:30', interval '15 minutes') as t;

-- Some slots are already busy (13:00 is almost full)
update pickup_slots set booked = 9 where slot_time = '13:00';
update pickup_slots set booked = 6 where slot_time = '12:45';
update pickup_slots set booked = 3 where slot_time = '13:15';
update pickup_slots set booked = 10 where slot_time = '12:30';   -- full

-- A few orders from other students, so the kitchen screen is not empty
with o as (
  insert into orders (student_id, slot_id, total, status)
  select 'S002', id, 135, 'preparing' from pickup_slots where slot_time = '12:45'
  returning id
)
insert into order_items (order_id, menu_item_id, quantity, price)
select o.id, m.id, x.qty, m.price
from o, (values ('Parotta with Salna', 2), ('Filter Coffee', 1)) as x(name, qty)
join menu_items m on m.name = x.name;

with o as (
  insert into orders (student_id, slot_id, total, status)
  select 'S003', id, 80, 'placed' from pickup_slots where slot_time = '13:00'
  returning id
)
insert into order_items (order_id, menu_item_id, quantity, price)
select o.id, m.id, x.qty, m.price
from o, (values ('Masala Dosa', 1), ('Fresh Lime Soda', 1)) as x(name, qty)
join menu_items m on m.name = x.name;

-- ---------------------------------------------------------------- functions
-- place_order: all-or-nothing. Either every check passes and all 4 changes
-- happen (order, order items, wallet, stock + slot), or nothing changes.
-- p_items example: '[{"menu_item_id": 1, "quantity": 2}]'
create or replace function place_order(p_student_id text, p_slot_id bigint, p_items jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_balance   int;
  v_total     int := 0;
  v_count     int := 0;
  v_slot      pickup_slots%rowtype;
  v_item      record;
  v_menu      menu_items%rowtype;
  v_order_id  bigint;
  v_lines     jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Please choose at least one item.';
  end if;

  select balance into v_balance from wallets where student_id = p_student_id for update;
  if not found then raise exception 'Wallet not found for student %.', p_student_id; end if;

  select * into v_slot from pickup_slots where id = p_slot_id for update;
  if not found then raise exception 'Pickup slot not found.'; end if;
  if v_slot.booked >= v_slot.capacity then
    raise exception 'The % pickup slot is full. Please choose another time.', to_char(v_slot.slot_time, 'HH24:MI');
  end if;

  -- check every item and work out the total
  for v_item in select (e->>'menu_item_id')::bigint as id, (e->>'quantity')::int as qty
                from jsonb_array_elements(p_items) e loop
    if v_item.qty is null or v_item.qty < 1 then raise exception 'Quantity must be at least 1.'; end if;
    select * into v_menu from menu_items where id = v_item.id for update;
    if not found then raise exception 'Menu item % not found.', v_item.id; end if;
    if v_menu.stock < v_item.qty then
      if v_menu.stock = 0 then
        raise exception '% is sold out.', v_menu.name;
      else
        raise exception 'Only % left of %.', v_menu.stock, v_menu.name;
      end if;
    end if;
    v_total := v_total + v_menu.price * v_item.qty;
    v_count := v_count + v_item.qty;
  end loop;

  if v_count > 5 then raise exception 'Maximum 5 items per order.'; end if;
  if v_total > v_balance then
    raise exception 'Not enough wallet balance. Order total is Rs %, wallet has Rs %.', v_total, v_balance;
  end if;

  -- all checks passed: make the changes
  insert into orders (student_id, slot_id, total) values (p_student_id, p_slot_id, v_total)
  returning id into v_order_id;

  for v_item in select (e->>'menu_item_id')::bigint as id, (e->>'quantity')::int as qty
                from jsonb_array_elements(p_items) e loop
    update menu_items set stock = stock - v_item.qty where id = v_item.id returning * into v_menu;
    insert into order_items (order_id, menu_item_id, quantity, price) values (v_order_id, v_item.id, v_item.qty, v_menu.price);
    v_lines := v_lines || jsonb_build_object('item', v_menu.name, 'quantity', v_item.qty, 'price', v_menu.price);
  end loop;

  update wallets set balance = balance - v_total where student_id = p_student_id returning balance into v_balance;
  update pickup_slots set booked = booked + 1 where id = p_slot_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'items', v_lines,
    'total', v_total,
    'pickup_time', to_char(v_slot.slot_time, 'HH24:MI'),
    'wallet_balance_after', v_balance,
    'status', 'placed'
  );
end;
$$;

-- cancel_order: allowed only while the kitchen has not started (status = placed).
-- Refunds the wallet, puts stock back and frees the slot.
create or replace function cancel_order(p_student_id text, p_order_id bigint)
returns jsonb
language plpgsql
as $$
declare
  v_order   orders%rowtype;
  v_balance int;
begin
  select * into v_order from orders where id = p_order_id and student_id = p_student_id for update;
  if not found then raise exception 'Order % not found for this student.', p_order_id; end if;
  if v_order.status <> 'placed' then
    raise exception 'Order % cannot be cancelled because it is already %.', p_order_id, v_order.status;
  end if;

  update menu_items m set stock = m.stock + oi.quantity
  from order_items oi where oi.order_id = p_order_id and oi.menu_item_id = m.id;
  update wallets set balance = balance + v_order.total where student_id = p_student_id returning balance into v_balance;
  update pickup_slots set booked = greatest(booked - 1, 0) where id = v_order.slot_id;
  update orders set status = 'cancelled' where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'refunded', v_order.total,
                            'wallet_balance_after', v_balance, 'status', 'cancelled');
end;
$$;

-- ---------------------------------------------------------------- security
alter table menu_items enable row level security;
alter table wallets enable row level security;
alter table pickup_slots enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

-- Only the server (secret key) can call the functions
revoke execute on function place_order(text, bigint, jsonb) from public;
revoke execute on function cancel_order(text, bigint) from public;
grant execute on function place_order(text, bigint, jsonb) to service_role;
grant execute on function cancel_order(text, bigint) to service_role;

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
notify pgrst, 'reload schema';
