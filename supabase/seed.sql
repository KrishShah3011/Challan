insert into public.seller (name, address, gstin, phone) values
  ('Shree Demo Industries', 'Plot 12, GIDC Estate, Naroda, Ahmedabad, Gujarat 382330', '24AAACS1234A1Z8', '+91 98765 43210');

insert into public.companies (name, address, gstin, state_code) values
  ('Patel Hardware Mart', '14 Station Road, Anand, Gujarat 388001', '24AAKFP5678B1Z5', '24'),
  ('Mehta Engineering Works', 'B-7 Udhyog Nagar, Rajkot, Gujarat 360002', '24ABCPM4321C1ZD', '24'),
  ('ABC Traders', '22 Ring Road, Surat, Gujarat 395002', '24AABCA1111D1ZR', '24'),
  ('ABC Traders', '5 Lamington Road, Mumbai, Maharashtra 400007', '27AABCA2222E1ZD', '27'),
  ('Ramesh Kumar & Sons', 'Johari Bazar, Jaipur, Rajasthan 302003', null, '08');

insert into public.items (name, description, hsn, unit, gst_rate, default_price) values
  ('MS Pipe 1 inch', 'Mild steel pipe, 1 inch', '7306', 'Mtr', 18, 120.00),
  ('GI Wire 12 gauge', 'Galvanised iron wire', '72172010', 'Kg', 18, 85.50),
  ('PVC Bend 2 inch', 'PVC pipe bend, 2 inch', '391740', 'Pcs', 18, 35.00),
  ('Cement Bag 50 kg', 'OPC 53 grade cement', '2523', 'Nos', 18, 380.00),
  ('Copper Wire 1.5 sqmm', 'Insulated copper wire', '85444999', 'Mtr', 18, 22.75),
  ('Turmeric Powder', 'Ground turmeric', '091030', 'Kg', 5, 160.00),
  ('Paddy Seeds', 'Certified paddy seeds', '1006', 'Kg', 0, null),
  ('Rough Diamond', 'Industrial rough diamond', '7102', 'Nos', 0.25, 5000.00),
  ('Wooden Pallet', 'Pinewood pallet', '441520', 'Nos', 18, 650.00),
  ('Corrugated Box', 'Packing box, 5 ply', '4819', 'Box', 5, 45.00);

insert into public.charge_types (name, gst_rate) values
  ('Freight', 18),
  ('Packing', 18),
  ('Loading', 5);
