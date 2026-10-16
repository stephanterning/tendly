ALTER TABLE "households" ADD COLUMN "revision" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE FUNCTION signal_household_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE households SET revision = revision + 1 WHERE id = COALESCE(NEW.household_id, OLD.household_id);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER tasks_change AFTER INSERT OR UPDATE OR DELETE ON tasks FOR EACH ROW EXECUTE FUNCTION signal_household_change();
--> statement-breakpoint
CREATE TRIGGER planning_entities_change AFTER INSERT OR UPDATE OR DELETE ON planning_entities FOR EACH ROW EXECUTE FUNCTION signal_household_change();
--> statement-breakpoint
CREATE TRIGGER saved_filters_change AFTER INSERT OR UPDATE OR DELETE ON saved_filters FOR EACH ROW EXECUTE FUNCTION signal_household_change();
--> statement-breakpoint
CREATE TRIGGER saved_views_change AFTER INSERT OR UPDATE OR DELETE ON saved_views FOR EACH ROW EXECUTE FUNCTION signal_household_change();
--> statement-breakpoint
CREATE TRIGGER task_templates_change AFTER INSERT OR UPDATE OR DELETE ON task_templates FOR EACH ROW EXECUTE FUNCTION signal_household_change();
--> statement-breakpoint
CREATE TRIGGER task_comments_change AFTER INSERT OR UPDATE OR DELETE ON task_comments FOR EACH ROW EXECUTE FUNCTION signal_household_change();
--> statement-breakpoint
CREATE TRIGGER task_files_change AFTER INSERT OR UPDATE OR DELETE ON task_files FOR EACH ROW EXECUTE FUNCTION signal_household_change();
--> statement-breakpoint
CREATE TRIGGER memberships_change AFTER INSERT OR UPDATE OR DELETE ON memberships FOR EACH ROW EXECUTE FUNCTION signal_household_change();
--> statement-breakpoint
CREATE TRIGGER planning_settings_change AFTER INSERT OR UPDATE OR DELETE ON planning_settings FOR EACH ROW EXECUTE FUNCTION signal_household_change();
--> statement-breakpoint
CREATE TRIGGER lifecycle_settings_change AFTER INSERT OR UPDATE OR DELETE ON lifecycle_settings FOR EACH ROW EXECUTE FUNCTION signal_household_change();
--> statement-breakpoint
CREATE FUNCTION signal_personal_view_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE households SET revision = revision + 1 WHERE id = (SELECT household_id FROM saved_views WHERE id = COALESCE(NEW.view_id, OLD.view_id));
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER personal_view_change AFTER INSERT OR UPDATE OR DELETE ON view_personal FOR EACH ROW EXECUTE FUNCTION signal_personal_view_change();
