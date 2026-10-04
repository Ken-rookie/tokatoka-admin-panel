# TokaToka Admin Panel

A standalone HTML/CSS/JavaScript admin panel for the TokaToka Flutter + Supabase ordering app.

## Included
- Supabase email/password admin login
- Server-side role gate through `profiles.role` (`admin` or `staff`)
- Dashboard metrics, date-range order reports, recent customers, and event/discount management
- Orders list, search/filter, detail view, and status updates
- Product CRUD: name, category, price, stock, availability, image, prep time
- Category CRUD and active/inactive state
- Customer/account listing
- Payment monitoring + CSV export
- Review moderation / visibility control
- CSV export for orders
- Responsive desktop/tablet/mobile layout
- Uses the same TokaToka colors from the Flutter app (`#F15A28`, `#16263F`, `#F7F1EA`)
- No service-role key or PayMongo secret is used in the browser

## Setup

1. Put this folder beside your Flutter project or host it as a separate static site.
2. `config.js` is already populated with the Supabase project URL and the anon key from the uploaded TokaToka `.env`. The anon key is intended for client-side use; keep service-role/secret keys out of this file.
3. In Supabase SQL Editor, run `admin-policies.sql` after the original `supabase/schema.sql`.
	This adds role-aware admin policies. Then run `product-image-schema.sql` to add product fields, create the public `product-images` bucket, and install its Storage policies. It is safe to rerun.
   Run `category-slug.sql` as well to generate unique category slugs in the database when an insert omits one. It is safe to rerun.
	Run `admin-dashboard.sql` after `admin-policies.sql` to create the events table, `event-images` bucket, and event Storage policies.
   Rerun `admin-policies.sql` after updating it to lock cancelled orders and cancel pending payments when an order is cancelled. Paid transactions remain paid until an actual refund is processed.
	To send Android push notifications for newly created active events, also run the Flutter project's `customer-push-notifications.sql`, configure `FIREBASE_SERVICE_ACCOUNT_JSON` as a Supabase Edge Function secret, deploy `send-event-notification`, and host this panel's latest `app.js`.
4. Create a user in Supabase Authentication.
5. Set that user's `profiles.role` to `admin` (or `staff`). For example:

```sql
update public.profiles
set role = 'admin', full_name = 'TokaToka Admin'
where id = 'YOUR_AUTH_USER_UUID';
```

6. Serve this directory through a local web server. ES modules and Supabase auth should not be tested by opening `index.html` directly with `file://`.

Example using VS Code Live Server or Python:

```bash
python -m http.server 5500
```

Then open `http://localhost:5500`.

## Important schema notes

The supplied customer app currently has the `orders` screen but its checkout screen says order placement is not connected yet. Therefore the admin order screens are ready for the existing/future `orders`, `order_items`, and `payments` rows, but they cannot create customer orders that the Flutter app itself does not create yet.

The supplied schema also initially exposes only customer-oriented RLS policies. `admin-policies.sql` adds role-aware policies required by this browser admin panel.
