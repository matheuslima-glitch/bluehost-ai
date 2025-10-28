-- Add unique constraint to namecheap_balance user_id
ALTER TABLE namecheap_balance ADD CONSTRAINT namecheap_balance_user_id_key UNIQUE (user_id);

-- Add unique constraint to domains for domain_name and user_id combination
ALTER TABLE domains ADD CONSTRAINT domains_domain_name_user_id_key UNIQUE (domain_name, user_id);