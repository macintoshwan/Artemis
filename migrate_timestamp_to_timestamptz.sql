-- ============================================================
-- 将 timestamp 字段改为 timestamptz（带时区）
-- ============================================================
-- 
-- 问题：当前使用 timestamp 类型（不带时区），导致时区信息丢失
-- 解决：改为 timestamptz 类型，PostgreSQL 会正确处理时区
--
-- 执行方法：
-- 1. 登录 Supabase Dashboard
-- 2. 进入 SQL Editor
-- 3. 执行以下 SQL 语句
-- ============================================================

-- 修改 projects 表的时间字段类型
ALTER TABLE projects 
  ALTER COLUMN plan_start_date TYPE timestamptz USING plan_start_date AT TIME ZONE 'UTC',
  ALTER COLUMN plan_end_date TYPE timestamptz USING plan_end_date AT TIME ZONE 'UTC',
  ALTER COLUMN actual_start_date TYPE timestamptz USING actual_start_date AT TIME ZONE 'UTC',
  ALTER COLUMN actual_end_date TYPE timestamptz USING actual_end_date AT TIME ZONE 'UTC';

-- 修改 tasks 表的时间字段类型
ALTER TABLE tasks 
  ALTER COLUMN plan_start_date TYPE timestamptz USING plan_start_date AT TIME ZONE 'UTC',
  ALTER COLUMN plan_end_date TYPE timestamptz USING plan_end_date AT TIME ZONE 'UTC',
  ALTER COLUMN actual_start_date TYPE timestamptz USING actual_start_date AT TIME ZONE 'UTC',
  ALTER COLUMN actual_end_date TYPE timestamptz USING actual_end_date AT TIME ZONE 'UTC';

-- 验证修改结果
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('projects', 'tasks') 
  AND column_name LIKE '%_date'
ORDER BY table_name, ordinal_position;

-- 预期结果应该显示所有 *_date 字段的类型为 'timestamp with time zone'
