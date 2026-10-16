-- Family Subscription Saver: Core Schema & Row Level Security (RLS)
-- Designed for PostgreSQL / Supabase

-- 1. Profiles (mirrors auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Households
CREATE TABLE IF NOT EXISTS public.households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Household Members
CREATE TYPE public.member_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE public.membership_status AS ENUM ('active', 'invited');

CREATE TABLE IF NOT EXISTS public.household_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.member_role NOT NULL DEFAULT 'member',
  status public.membership_status NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_household_user UNIQUE (household_id, user_id)
);

-- 4. Subscriptions
CREATE TYPE public.billing_cycle AS ENUM (
  'monthly', 'quarterly', 'half_yearly', 'annual', 'prepaid', 'one_time'
);
CREATE TYPE public.subscription_category AS ENUM (
  'ott', 'music', 'ai', 'cloud', 'telecom', 'gaming', 'news', 'utilities', 'fitness', 'other'
);
CREATE TYPE public.visibility_level AS ENUM (
  'full_details', 'totals_only', 'hidden'
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  plan_name TEXT,
  category public.subscription_category NOT NULL DEFAULT 'other',
  billing_cycle public.billing_cycle NOT NULL DEFAULT 'monthly',
  amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0),
  validity_days INTEGER CHECK (validity_days > 0),
  payer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  billing_channel TEXT,
  renewal_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  visibility public.visibility_level NOT NULL DEFAULT 'full_details',
  source TEXT NOT NULL DEFAULT 'manual',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Subscription Beneficiaries / Users
CREATE TABLE IF NOT EXISTS public.subscription_users (
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (subscription_id, user_id)
);

-- 6. Receipt / Screenshot Imports
CREATE TABLE IF NOT EXISTS public.imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_name TEXT,
  file_size BIGINT,
  status TEXT NOT NULL DEFAULT 'pending_review',
  extracted_data JSONB,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. Audit Events
CREATE TABLE IF NOT EXISTS public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Helper Security Function: Check if current auth user is an active household member
CREATE OR REPLACE FUNCTION public.is_household_member(target_household_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = target_household_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Users can view profile if same user or co-members"
  ON public.profiles FOR SELECT
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.household_members m1
      JOIN public.household_members m2 ON m1.household_id = m2.household_id
      WHERE m1.user_id = auth.uid() AND m2.user_id = public.profiles.id
    )
  );

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

-- Households Policies
CREATE POLICY "Members can view their households"
  ON public.households FOR SELECT
  USING (public.is_household_member(id));

CREATE POLICY "Authenticated users can create a household"
  ON public.households FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Household Members Policies
CREATE POLICY "Members can view household member list"
  ON public.household_members FOR SELECT
  USING (public.is_household_member(household_id));

CREATE POLICY "Admins or owners can manage members"
  ON public.household_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.household_members
      WHERE household_id = public.household_members.household_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
  );

-- Subscriptions Policies
-- SELECT: Active members can view subscriptions UNLESS visibility is 'hidden' and viewer is NOT the payer!
CREATE POLICY "Active household members view subscriptions respecting visibility"
  ON public.subscriptions FOR SELECT
  USING (
    public.is_household_member(household_id)
    AND (
      visibility != 'hidden'
      OR payer_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert subscriptions into their household"
  ON public.subscriptions FOR INSERT
  WITH CHECK (
    public.is_household_member(household_id)
    AND payer_id = auth.uid()
  );

CREATE POLICY "Payers or household admins can update subscriptions"
  ON public.subscriptions FOR UPDATE
  USING (
    public.is_household_member(household_id)
    AND (
      payer_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.household_members
        WHERE household_id = public.subscriptions.household_id
          AND user_id = auth.uid()
          AND role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "Payers or household admins can delete subscriptions"
  ON public.subscriptions FOR DELETE
  USING (
    public.is_household_member(household_id)
    AND (
      payer_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.household_members
        WHERE household_id = public.subscriptions.household_id
          AND user_id = auth.uid()
          AND role IN ('owner', 'admin')
      )
    )
  );

