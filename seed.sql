-- 1. Assets
INSERT INTO assets (id, symbol, name) VALUES
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'GOLD',    'Gold Coins'),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'DIAMOND', 'Diamonds')
ON CONFLICT (symbol) DO NOTHING;

-- 2. Users
INSERT INTO users (id, name, email) VALUES
    ('00000000-0000-0000-0000-000000000001', 'System Treasury', 'treasury@system.internal'),
    ('00000000-0000-0000-0000-000000000002', 'Alice',           'alice@example.com'),
    ('00000000-0000-0000-0000-000000000003', 'Bob',             'bob@example.com'),
    ('00000000-0000-0000-0000-000000000004', 'Charlie',         'charlie@example.com')
ON CONFLICT (email) DO NOTHING;

-- 3. Wallets
INSERT INTO wallets (user_id, asset_id, balance) VALUES
    -- Treasury: large supply as the source of all credits
    ('00000000-0000-0000-0000-000000000001', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 1000000),
    ('00000000-0000-0000-0000-000000000001', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 1000000),
    -- Users: realistic starting balances
    ('00000000-0000-0000-0000-000000000002', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 100),      -- Alice   100 GOLD
    ('00000000-0000-0000-0000-000000000003', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 200),      -- Bob     200 GOLD
    ('00000000-0000-0000-0000-000000000004', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 30)        -- Charlie  30 DIAMOND
ON CONFLICT (user_id, asset_id) DO NOTHING;
