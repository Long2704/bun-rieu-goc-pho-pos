begin;
set local lock_timeout='5s';
-- Only relax drink-note handling. Routing, financial, version and permission guards remain unchanged.
do $patch$ declare v text;begin
 select pg_get_functiondef('public.save_menu_selection(integer,uuid,jsonb)'::regprocedure) into v;
 if position('case when v_menu.category=''do_uong'' then '''' else coalesce(v_item.note, '''') end' in v)=0 then raise exception 'Unexpected drink-note function definition';end if;
 execute replace(v,'case when v_menu.category=''do_uong'' then '''' else coalesce(v_item.note, '''') end','coalesce(v_item.note, '''')');
end;$patch$;
do $patch$ declare v text;begin
 select pg_get_functiondef('public.edit_saved_menu_selection(uuid,integer,text,integer,text)'::regprocedure) into v;
 if position('case when v_item.category=''do_uong'' then '''' else btrim(coalesce(p_note,'''')) end' in v)=0 then raise exception 'Unexpected drink-note function definition';end if;
 execute replace(v,'case when v_item.category=''do_uong'' then '''' else btrim(coalesce(p_note,'''')) end','btrim(coalesce(p_note,''''))');
end;$patch$;
do $patch$ declare v text;begin
 select pg_get_functiondef('public.edit_sent_order_note(uuid,uuid,uuid,integer,text,text)'::regprocedure) into v;
 if position('and status=''cooking'' and kitchen_relevant for update' in v)=0 then raise exception 'Unexpected drink-note function definition';end if;
 execute replace(v,'and status=''cooking'' and kitchen_relevant for update','and ((status=''cooking'' and kitchen_relevant) or exists(select 1 from public.order_items where id=p_item_id and order_id=p_order_id and category=''do_uong'')) for update');
end;$patch$;
do $patch$ declare v text;begin
 select pg_get_functiondef('public.edit_sent_order_note(uuid,uuid,uuid,integer,text,text)'::regprocedure) into v;
 if position(' or v_item.category=''do_uong''' in v)=0 then raise exception 'Unexpected drink-note function definition';end if;
 execute replace(v,' or v_item.category=''do_uong''','');
end;$patch$;
notify pgrst,'reload schema';
commit;
