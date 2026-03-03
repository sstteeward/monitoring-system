-- RPC for handling failed login attempts securely (bypasses RLS)
CREATE OR REPLACE FUNCTION increment_failed_login(user_email TEXT)
RETURNS void AS $$
DECLARE
    current_attempts INT;
BEGIN
    SELECT COALESCE(failed_login_attempts, 0) INTO current_attempts FROM public.profiles WHERE email = user_email;
    current_attempts := current_attempts + 1;
    
    IF current_attempts >= 5 THEN
        -- Lock account for 15 minutes
        UPDATE public.profiles SET failed_login_attempts = current_attempts, locked_until = NOW() + INTERVAL '15 minutes' WHERE email = user_email;
    ELSE
        UPDATE public.profiles SET failed_login_attempts = current_attempts WHERE email = user_email;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC for clearing failed login attempts on successful login
CREATE OR REPLACE FUNCTION reset_failed_login(user_email TEXT)
RETURNS void AS $$
BEGIN
    UPDATE public.profiles SET failed_login_attempts = 0, locked_until = NULL WHERE email = user_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
