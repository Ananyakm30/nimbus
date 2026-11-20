-- CPCB National AQI breakpoints (Central Pollution Control Board, 2014 NAQI).
-- Concentration units: ug/m3 except CO in mg/m3.
-- averaging: 24h for PM2.5, PM10, NO2, SO2, NH3; 8h for CO and O3.
DROP TABLE IF EXISTS ref_cpcb_breakpoints;
CREATE TABLE ref_cpcb_breakpoints (
    pollutant TEXT NOT NULL,
    category  TEXT NOT NULL,
    c_lo REAL NOT NULL, c_hi REAL NOT NULL,
    i_lo REAL NOT NULL, i_hi REAL NOT NULL
);

INSERT INTO ref_cpcb_breakpoints VALUES
('PM2.5','Good',0,30,0,50),
('PM2.5','Satisfactory',31,60,51,100),
('PM2.5','Moderate',61,90,101,200),
('PM2.5','Poor',91,120,201,300),
('PM2.5','Very Poor',121,250,301,400),
('PM2.5','Severe',251,500,401,500),

('PM10','Good',0,50,0,50),
('PM10','Satisfactory',51,100,51,100),
('PM10','Moderate',101,250,101,200),
('PM10','Poor',251,350,201,300),
('PM10','Very Poor',351,430,301,400),
('PM10','Severe',431,800,401,500),

('NO2','Good',0,40,0,50),
('NO2','Satisfactory',41,80,51,100),
('NO2','Moderate',81,180,101,200),
('NO2','Poor',181,280,201,300),
('NO2','Very Poor',281,400,301,400),
('NO2','Severe',401,800,401,500),

('SO2','Good',0,40,0,50),
('SO2','Satisfactory',41,80,51,100),
('SO2','Moderate',81,380,101,200),
('SO2','Poor',381,800,201,300),
('SO2','Very Poor',801,1600,301,400),
('SO2','Severe',1601,3200,401,500),

('CO','Good',0,1.0,0,50),
('CO','Satisfactory',1.1,2.0,51,100),
('CO','Moderate',2.1,10,101,200),
('CO','Poor',10.1,17,201,300),
('CO','Very Poor',17.1,34,301,400),
('CO','Severe',34.1,68,401,500),

('O3','Good',0,50,0,50),
('O3','Satisfactory',51,100,51,100),
('O3','Moderate',101,168,101,200),
('O3','Poor',169,208,201,300),
('O3','Very Poor',209,748,301,400),
('O3','Severe',749,1500,401,500),

('NH3','Good',0,200,0,50),
('NH3','Satisfactory',201,400,51,100),
('NH3','Moderate',401,800,101,200),
('NH3','Poor',801,1200,201,300),
('NH3','Very Poor',1201,1800,301,400),
('NH3','Severe',1801,3600,401,500);
