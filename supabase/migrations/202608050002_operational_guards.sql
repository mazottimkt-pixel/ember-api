create or replace function public.guard_operational_document_transition() returns trigger language plpgsql set search_path='' as $$
declare allowed boolean:=false;
begin
  if old.status=new.status then allowed:=true;
  elsif old.type='service_order' then allowed:=(old.status,new.status) in (('draft','pending_approval'),('draft','cancelled'),('pending_approval','approved'),('pending_approval','rejected'),('pending_approval','cancelled'),('approved','scheduled'),('approved','cancelled'),('scheduled','in_progress'),('scheduled','cancelled'),('in_progress','paused'),('in_progress','completed'),('in_progress','cancelled'),('paused','in_progress'),('paused','cancelled'));
  elsif old.type='checklist' then allowed:=(old.status,new.status) in (('draft','in_progress'),('draft','cancelled'),('in_progress','completed'),('in_progress','completed_with_issues'),('in_progress','cancelled'));
  elsif old.type='service_report' then allowed:=(old.status,new.status) in (('draft','under_review'),('draft','cancelled'),('under_review','ready_for_acceptance'),('under_review','draft'),('under_review','cancelled'),('ready_for_acceptance','accepted'),('ready_for_acceptance','under_review'),('ready_for_acceptance','cancelled'),('accepted','completed'));
  end if;
  if not allowed then raise exception 'invalid operational transition'; end if;
  if old.status in ('accepted','completed','completed_with_issues','cancelled') and (new.title is distinct from old.title or new.description is distinct from old.description or new.content is distinct from old.content or new.counterparty_snapshot is distinct from old.counterparty_snapshot or new.location_snapshot is distinct from old.location_snapshot) then raise exception 'terminal operational content is immutable'; end if;
  return new;
end $$;
create trigger operational_document_transition_guard before update on public.operational_documents for each row execute function public.guard_operational_document_transition();

create or replace function public.guard_checklist_item_update() returns trigger language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from public.operational_documents d where d.id=new.checklist_id and d.organization_id=new.organization_id and d.type='checklist' and d.status in ('draft','in_progress')) then raise exception 'checklist is not editable'; end if;
  return new;
end $$;
create trigger checklist_item_update_guard before update on public.operational_checklist_items for each row execute function public.guard_checklist_item_update();
