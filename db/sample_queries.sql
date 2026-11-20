-- Hand-runnable versions of the analytical queries (MySQL 8 / SQLite 3.25+).
-- The live, filter-aware versions are in backend/app/sql_analytics/queries.py and browsable in the SQL Explorer page.
-- `is_demo = 1` queries the synthetic DEMO dataset; change it to 0 for real uploaded data.

-- 1. Ranking stations by average AQI (RANK, DENSE_RANK, CTE, CASE)
WITH station_stats AS (
    SELECT s.station_id, s.name AS station, COUNT(r.aqi) AS readings, AVG(r.aqi) AS avg_aqi
    FROM air_quality_readings r JOIN monitoring_stations s ON s.station_id = r.station_id
    WHERE r.is_demo = 1 AND r.aqi IS NOT NULL
    GROUP BY s.station_id, s.name),
city AS (SELECT AVG(aqi) AS city_avg FROM air_quality_readings WHERE is_demo = 1 AND aqi IS NOT NULL)
SELECT ss.station, ROUND(ss.avg_aqi, 1) AS avg_aqi,
       RANK() OVER (ORDER BY ss.avg_aqi DESC) AS pollution_rank,
       DENSE_RANK() OVER (ORDER BY ROUND(ss.avg_aqi, 0) DESC) AS dense_rank_rounded,
       ROUND(100.0 * (ss.avg_aqi - c.city_avg) / NULLIF(c.city_avg, 0), 1) AS pct_vs_city,
       CASE WHEN ss.avg_aqi <= 50 THEN 'Good' WHEN ss.avg_aqi <= 100 THEN 'Satisfactory'
            WHEN ss.avg_aqi <= 200 THEN 'Moderate' WHEN ss.avg_aqi <= 300 THEN 'Poor'
            WHEN ss.avg_aqi <= 400 THEN 'Very Poor' ELSE 'Severe' END AS category
FROM station_stats ss CROSS JOIN city c
ORDER BY pollution_rank;

-- 2. Year-over-year change with LAG / LEAD
WITH yearly AS (
    SELECT year, AVG(aqi) AS avg_aqi, COUNT(DISTINCT month) AS months_covered
    FROM air_quality_readings WHERE is_demo = 1 AND aqi IS NOT NULL GROUP BY year)
SELECT year, ROUND(avg_aqi, 1) AS avg_aqi, months_covered,
       ROUND(LAG(avg_aqi) OVER (ORDER BY year), 1)  AS prev_year,
       ROUND(LEAD(avg_aqi) OVER (ORDER BY year), 1) AS next_year,
       ROUND(100.0 * (avg_aqi - LAG(avg_aqi) OVER (ORDER BY year)) / NULLIF(LAG(avg_aqi) OVER (ORDER BY year), 0), 1) AS pct_change
FROM yearly ORDER BY year;

-- 3. Peak pollution hours
SELECT hour, ROUND(AVG(aqi), 1) AS avg_aqi, RANK() OVER (ORDER BY AVG(aqi) DESC) AS peak_rank
FROM air_quality_readings WHERE is_demo = 1 AND hour IS NOT NULL AND aqi IS NOT NULL
GROUP BY hour ORDER BY hour;

-- 4. Missing values per station
SELECT s.name, COUNT(*) AS records,
       SUM(CASE WHEN r.pm25 IS NULL THEN 1 ELSE 0 END) AS missing_pm25,
       ROUND(100.0 * SUM(CASE WHEN r.pm25 IS NULL THEN 1 ELSE 0 END) / COUNT(*), 1) AS missing_pm25_pct
FROM air_quality_readings r JOIN monitoring_stations s ON s.station_id = r.station_id
WHERE r.is_demo = 1 GROUP BY s.name ORDER BY missing_pm25_pct DESC;

-- 5. Duplicate records in the preserved raw upload
SELECT import_id, station_raw, ts_raw, COUNT(*) AS copies
FROM raw_records GROUP BY import_id, station_raw, ts_raw HAVING COUNT(*) > 1
ORDER BY copies DESC LIMIT 20;

-- 6. Most polluted days (DENSE_RANK)
WITH daily AS (
    SELECT day, AVG(aqi) AS avg_aqi FROM air_quality_readings
    WHERE is_demo = 1 AND aqi IS NOT NULL GROUP BY day HAVING COUNT(aqi) >= 3)
SELECT day, ROUND(avg_aqi, 1) AS avg_aqi, DENSE_RANK() OVER (ORDER BY avg_aqi DESC) AS period_rank
FROM daily ORDER BY avg_aqi DESC LIMIT 10;
