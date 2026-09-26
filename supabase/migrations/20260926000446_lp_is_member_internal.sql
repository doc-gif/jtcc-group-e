-- T14: lp_is_member is only called inside SECURITY DEFINER functions owned by the migration role.
-- Signed-in users do not need it as a Data API RPC, so remove it from /rest/v1/rpc.
revoke execute on function public.lp_is_member(uuid) from authenticated;
