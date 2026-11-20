begin;
set local lock_timeout='5s';

do $patch$
declare
 definition text;
 guard constant text:='if v_item.category=''do_uong'' and v_item.drink_done_qty>0 then';
 takeaway_check constant text:='if v_item.takeaway_version<>p_expected_version';
 note_check constant text:='if v_item.note_version<>p_expected_version';
begin
 -- Insert the checks after row locks and after the existing request replay check.
 definition:=pg_get_functiondef('pos_sync.set_item_takeaway(uuid,uuid,integer,boolean,boolean)'::regprocedure);
 if position(takeaway_check in definition)=0 then raise exception 'Unexpected set_item_takeaway definition';end if;
 execute replace(definition,takeaway_check,guard||$lock$
  raise exception 'Nước đã hoàn thành. Dấu Mang về đã khóa.';
 end if;
 $lock$||takeaway_check);

 definition:=pg_get_functiondef('public.edit_sent_order_note(uuid,uuid,uuid,integer,text,text)'::regprocedure);
 if position(note_check in definition)=0 then raise exception 'Unexpected edit_sent_order_note definition';end if;
 execute replace(definition,note_check,guard||$lock$
  raise exception 'Nước đã hoàn thành. Không thể sửa ghi chú.';
 end if;
 $lock$||note_check);
end;
$patch$;

notify pgrst,'reload schema';
commit;
