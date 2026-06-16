UPDATE public.user_roles SET role='admin' WHERE user_id='97b14ee6-cc20-4f9e-9cc8-971d8df23e08';
INSERT INTO public.user_roles (user_id, role)
SELECT '97b14ee6-cc20-4f9e-9cc8-971d8df23e08','admin'
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id='97b14ee6-cc20-4f9e-9cc8-971d8df23e08' AND role='admin');