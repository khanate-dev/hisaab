-- PowerSync replicates from this publication (ADR-0007). Tables added to `public` later join it automatically;
-- auth.* and other schemas stay out.
create publication powersync for tables in schema public;
