--
-- PostgreSQL database dump
--

-- Dumped from database version 16.3 (Debian 16.3-1.pgdg120+1)
-- Dumped by pg_dump version 16.4

-- Started on 2024-10-02 08:42:57

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


DROP TABLE public.progress;
DROP TABLE public.enrollment;
DROP TABLE public.activity_codes;
DROP TABLE public.activities;
DROP TABLE public.user_registrations;
DROP TABLE public.users;

--
-- TOC entry 223 (class 1259 OID 18000)
-- Name: activities; Type: TABLE; Schema: public; Owner: modulus_owner
--

CREATE TABLE public.activities (
    id uuid NOT NULL,
    url character varying(255) NOT NULL,
    name character varying
);


ALTER TABLE public.activities OWNER TO modulus_owner;

--
-- TOC entry 225 (class 1259 OID 18014)
-- Name: activity_codes; Type: TABLE; Schema: public; Owner: modulus_owner
--

CREATE TABLE public.activity_codes (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    code character varying(255) NOT NULL,
    private_code character varying(255) NOT NULL
);


ALTER TABLE public.activity_codes OWNER TO modulus_owner;

--
-- TOC entry 224 (class 1259 OID 18009)
-- Name: enrollment; Type: TABLE; Schema: public; Owner: modulus_owner
--

CREATE TABLE public.enrollment (
    activity_code_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    user_id uuid NOT NULL
);


ALTER TABLE public.enrollment OWNER TO modulus_owner;

--
-- TOC entry 222 (class 1259 OID 17992)
-- Name: permissions; Type: TABLE; Schema: public; Owner: modulus_owner
--

CREATE TABLE public.permissions (
    id uuid NOT NULL,
    vid integer DEFAULT 1 NOT NULL,
    role_id uuid NOT NULL,
    ability character varying(128),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.permissions OWNER TO modulus_owner;

--
-- TOC entry 226 (class 1259 OID 18025)
-- Name: progress; Type: TABLE; Schema: public; Owner: modulus_owner
--

CREATE TABLE public.progress (
    activity_id uuid NOT NULL,
    user_id uuid NOT NULL,
    progress real NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.progress OWNER TO modulus_owner;

--
-- TOC entry 221 (class 1259 OID 17987)
-- Name: role_user; Type: TABLE; Schema: public; Owner: modulus_owner
--

CREATE TABLE public.role_user (
    role_id uuid NOT NULL,
    user_id uuid NOT NULL
);


ALTER TABLE public.role_user OWNER TO modulus_owner;

--
-- TOC entry 220 (class 1259 OID 17974)
-- Name: roles; Type: TABLE; Schema: public; Owner: modulus_owner
--

CREATE TABLE public.roles (
    id uuid NOT NULL,
    vid integer DEFAULT 1 NOT NULL,
    full_name character varying(128),
    machine_name character varying(128) NOT NULL,
    description text,
    "order" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.roles OWNER TO modulus_owner;

--
-- TOC entry 218 (class 1259 OID 17941)
-- Name: user_registrations; Type: TABLE; Schema: public; Owner: modulus_owner
--

CREATE TABLE public.user_registrations (
    id uuid NOT NULL,
    full_name character varying(50) NOT NULL,
    username character varying(26),
    email character varying(50) NOT NULL,
    created_at timestamp(6) without time zone DEFAULT now(),
    updated_at timestamp(6) without time zone DEFAULT now(),
    agreed_to_terms boolean DEFAULT false NOT NULL,
    is_email_verified boolean DEFAULT false NOT NULL,
    verification_code character varying(50) NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    ip character varying(40) DEFAULT '0.0.0.0'::character varying NOT NULL
);


ALTER TABLE public.user_registrations OWNER TO modulus_owner;

--
-- TOC entry 219 (class 1259 OID 17956)
-- Name: users; Type: TABLE; Schema: public; Owner: modulus_owner
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    vid integer DEFAULT 1 NOT NULL,
    full_name character varying(50),
    username character varying(26),
    email character varying(50),
    password character varying(128),
    created_at timestamp(6) without time zone DEFAULT now(),
    updated_at timestamp(6) without time zone DEFAULT now(),
    agreed_to_terms boolean DEFAULT false NOT NULL,
    last_login timestamp(6) without time zone DEFAULT now(),
    last_login_ip character varying(40) DEFAULT '0.0.0.0'::character varying NOT NULL,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    is_email_verified boolean DEFAULT false NOT NULL
);


ALTER TABLE public.users OWNER TO modulus_owner;

--
-- TOC entry 3240 (class 2604 OID 17936)
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: modulus_owner
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- TOC entry 3454 (class 0 OID 17933)
-- Dependencies: 217
-- Data for Name: __drizzle_migrations; Type: TABLE DATA; Schema: drizzle; Owner: modulus_owner
--

INSERT INTO drizzle.__drizzle_migrations VALUES (1, '463b83a87237f71e156cc689cccdcf7f8938a8c392b9c56564c5f4d1a87a9a32', 1727234424513);


--
-- TOC entry 3460 (class 0 OID 18000)
-- Dependencies: 223
-- Data for Name: activities; Type: TABLE DATA; Schema: public; Owner: modulus_owner
--

INSERT INTO public.activities VALUES ('019249af-95c6-7ee7-a250-bbdc8723acea', 'https://ximera.osu.edu/mooculus/calculus1/whatIsALimit/breakGround', 'Stars and functions');
INSERT INTO public.activities VALUES ('019249af-95c6-7ee7-a250-c7e24dd9a11b', 'https://ximera.osu.edu/mooculus/calculus1/whatIsALimit/digInWhatIsALimit', 'What is a limit?');
INSERT INTO public.activities VALUES ('019249af-95c6-7ee7-a250-cfd504f28d58', 'https://ximera.osu.edu/mooculus/calculus1/whatIsALimit/digInContinuity', 'Continuity');
INSERT INTO public.activities VALUES ('019249af-95c6-7ee7-a250-d020940e5875', 'https://ximera.osu.edu/mooculus/calculus1/limitLaws/breakGround', 'Equal or not?');
INSERT INTO public.activities VALUES ('019249af-95c6-7ee7-a250-da3fa6192516', 'https://ximera.osu.edu/mooculus/calculus1/limitLaws/digInLimitLaws', 'The limit laws');
INSERT INTO public.activities VALUES ('019249af-95c6-7ee7-a250-e1d989782f57', 'https://ximera.osu.edu/mooculus/calculus1/limitLaws/digInTheSqueezeTheorem', 'The squeeze theorem');
INSERT INTO public.activities VALUES ('01924ab6-7245-7ffb-92d6-c2b65cf7c47f', 'http://localhost:3000/dashboard', NULL);
INSERT INTO public.activities VALUES ('01924abb-7363-7ffb-92d6-d675d7a89b9c', 'http://localhost:5173/assignment1', 'Assignment 1');


--
-- TOC entry 3462 (class 0 OID 18014)
-- Dependencies: 225
-- Data for Name: activity_codes; Type: TABLE DATA; Schema: public; Owner: modulus_owner
--

INSERT INTO public.activity_codes VALUES ('019249af-95c3-7ee7-a250-9ecd95ce0e7d', '019249af-95b1-7ee7-a250-02137fc6f3a1', 'my-course-101', '98fj98jloawifj');
INSERT INTO public.activity_codes VALUES ('019249af-95c3-7ee7-a250-a488aed7804b', '019249af-95b1-7ee7-a250-02137fc6f3a1', 'my-course-202', 'fejwaoifoeweif');
INSERT INTO public.activity_codes VALUES ('019249af-95c3-7ee7-a250-a82734428f76', '019249af-95b1-7ee7-a250-132944743a0b', 'algebra-2', 'ofjwiejf23fa9w');
INSERT INTO public.activity_codes VALUES ('019249af-95c3-7ee7-a250-b5d2d5cef167', '019249af-95b1-7ee7-a250-1a0300277454', 'calc-101', 'f389fj98f23382');
INSERT INTO public.activity_codes VALUES ('019249b9-1881-7006-bd84-cc0eb321b0c4', '019249af-95b1-7ee7-a250-132944743a0b', 'enormous-gerbil', 'e4603214bf4e2a3a');
INSERT INTO public.activity_codes VALUES ('01924ab5-2239-7ffb-92d6-8da76187008b', '019249af-95b1-7ee7-a250-132944743a0b', 'voluntary-kangaroo', 'c9ce6f470a223b1c');


--
-- TOC entry 3461 (class 0 OID 18009)
-- Dependencies: 224
-- Data for Name: enrollment; Type: TABLE DATA; Schema: public; Owner: modulus_owner
--

INSERT INTO public.enrollment VALUES ('019249af-95c3-7ee7-a250-9ecd95ce0e7d', '019249af-95c6-7ee7-a250-bbdc8723acea', '019249af-95b1-7ee7-a250-0aa64c1a5601');
INSERT INTO public.enrollment VALUES ('019249af-95c3-7ee7-a250-9ecd95ce0e7d', '019249af-95c6-7ee7-a250-c7e24dd9a11b', '019249af-95b1-7ee7-a250-0aa64c1a5601');
INSERT INTO public.enrollment VALUES ('019249af-95c3-7ee7-a250-9ecd95ce0e7d', '019249af-95c6-7ee7-a250-cfd504f28d58', '019249af-95b1-7ee7-a250-0aa64c1a5601');
INSERT INTO public.enrollment VALUES ('01924ab5-2239-7ffb-92d6-8da76187008b', '01924ab6-7245-7ffb-92d6-c2b65cf7c47f', '01924ab6-7219-7ffb-92d6-b42df3e762f0');
INSERT INTO public.enrollment VALUES ('01924ab5-2239-7ffb-92d6-8da76187008b', '01924abb-7363-7ffb-92d6-d675d7a89b9c', '01924ab6-7219-7ffb-92d6-b42df3e762f0');


--
-- TOC entry 3459 (class 0 OID 17992)
-- Dependencies: 222
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: modulus_owner
--

INSERT INTO public.permissions VALUES ('019249af-95b9-7ee7-a250-42ebcd965389', 1, '019249af-95b7-7ee7-a250-2e007858ab93', 'account:read_own', '2024-10-01 20:04:56.890434+00', '2024-10-01 20:04:56.890434+00');
INSERT INTO public.permissions VALUES ('019249af-95b9-7ee7-a250-4bf2de5efc32', 1, '019249af-95b7-7ee7-a250-2e007858ab93', 'account:edit_own', '2024-10-01 20:04:56.890434+00', '2024-10-01 20:04:56.890434+00');
INSERT INTO public.permissions VALUES ('019249af-95b9-7ee7-a250-516b4622d641', 1, '019249af-95b7-7ee7-a250-2e007858ab93', 'account:delete_own', '2024-10-01 20:04:56.890434+00', '2024-10-01 20:04:56.890434+00');
INSERT INTO public.permissions VALUES ('019249af-95b9-7ee7-a250-5cca83432c6b', 1, '019249af-95b7-7ee7-a250-2e007858ab93', 'profile:read_own', '2024-10-01 20:04:56.890434+00', '2024-10-01 20:04:56.890434+00');
INSERT INTO public.permissions VALUES ('019249af-95b9-7ee7-a250-61cb61cc4150', 1, '019249af-95b7-7ee7-a250-2e007858ab93', 'profile:edit_own', '2024-10-01 20:04:56.890434+00', '2024-10-01 20:04:56.890434+00');
INSERT INTO public.permissions VALUES ('019249af-95b9-7ee7-a250-6eb5e24fb4b4', 1, '019249af-95b7-7ee7-a250-2e007858ab93', 'profile:delete_own', '2024-10-01 20:04:56.890434+00', '2024-10-01 20:04:56.890434+00');
INSERT INTO public.permissions VALUES ('019249af-95bf-7ee7-a250-7293eac3ceae', 1, '019249af-95b7-7ee7-a250-349da3b446a6', 'activity_codes:list_own', '2024-10-01 20:04:56.896158+00', '2024-10-01 20:04:56.896158+00');
INSERT INTO public.permissions VALUES ('019249af-95bf-7ee7-a250-7c66b6b0655a', 1, '019249af-95b7-7ee7-a250-349da3b446a6', 'activity_codes:read_own', '2024-10-01 20:04:56.896158+00', '2024-10-01 20:04:56.896158+00');
INSERT INTO public.permissions VALUES ('019249af-95bf-7ee7-a250-82c6dd3ed543', 1, '019249af-95b7-7ee7-a250-349da3b446a6', 'activity_codes:create_own', '2024-10-01 20:04:56.896158+00', '2024-10-01 20:04:56.896158+00');
INSERT INTO public.permissions VALUES ('019249af-95bf-7ee7-a250-89ebb4a7d7fc', 1, '019249af-95b7-7ee7-a250-349da3b446a6', 'activity_codes:update_own', '2024-10-01 20:04:56.896158+00', '2024-10-01 20:04:56.896158+00');
INSERT INTO public.permissions VALUES ('019249af-95bf-7ee7-a250-968502bb4004', 1, '019249af-95b7-7ee7-a250-349da3b446a6', 'activity_codes:delete_own', '2024-10-01 20:04:56.896158+00', '2024-10-01 20:04:56.896158+00');


--
-- TOC entry 3463 (class 0 OID 18025)
-- Dependencies: 226
-- Data for Name: progress; Type: TABLE DATA; Schema: public; Owner: modulus_owner
--

INSERT INTO public.progress VALUES ('019249af-95c6-7ee7-a250-bbdc8723acea', '019249af-95b1-7ee7-a250-0aa64c1a5601', 1, '2024-10-01 20:04:56.906757+00', '2024-10-01 20:04:56.906757+00');
INSERT INTO public.progress VALUES ('019249af-95c6-7ee7-a250-c7e24dd9a11b', '019249af-95b1-7ee7-a250-0aa64c1a5601', 0.33, '2024-10-01 20:04:56.906757+00', '2024-10-01 20:04:56.906757+00');
INSERT INTO public.progress VALUES ('019249af-95c6-7ee7-a250-cfd504f28d58', '019249af-95b1-7ee7-a250-0aa64c1a5601', 0, '2024-10-01 20:04:56.906757+00', '2024-10-01 20:04:56.906757+00');
INSERT INTO public.progress VALUES ('01924abb-7363-7ffb-92d6-d675d7a89b9c', '01924ab6-7219-7ffb-92d6-b42df3e762f0', 0.6666667, '2024-10-02 01:04:21.878531+00', '2024-10-02 01:04:21.878531+00');


--
-- TOC entry 3458 (class 0 OID 17987)
-- Dependencies: 221
-- Data for Name: role_user; Type: TABLE DATA; Schema: public; Owner: modulus_owner
--

INSERT INTO public.role_user VALUES ('019249af-95b7-7ee7-a250-2e007858ab93', '019249af-95b1-7ee7-a250-132944743a0b');
INSERT INTO public.role_user VALUES ('019249af-95b7-7ee7-a250-349da3b446a6', '019249af-95b1-7ee7-a250-132944743a0b');
INSERT INTO public.role_user VALUES ('019249af-95b7-7ee7-a250-2e007858ab93', '019249af-95b1-7ee7-a250-1a0300277454');
INSERT INTO public.role_user VALUES ('019249af-95b7-7ee7-a250-349da3b446a6', '019249af-95b1-7ee7-a250-1a0300277454');


--
-- TOC entry 3457 (class 0 OID 17974)
-- Dependencies: 220
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: modulus_owner
--

INSERT INTO public.roles VALUES ('019249af-95b7-7ee7-a250-2e007858ab93', 1, 'Everyone', 'everyone', NULL, 0, '2024-10-01 20:04:56.88818+00', '2024-10-01 20:04:56.88818+00');
INSERT INTO public.roles VALUES ('019249af-95b7-7ee7-a250-349da3b446a6', 1, 'Instructors', 'instructor', NULL, 0, '2024-10-01 20:04:56.88818+00', '2024-10-01 20:04:56.88818+00');
INSERT INTO public.roles VALUES ('019249af-95b7-7ee7-a250-3e84cb95b88c', 1, 'Learners', 'learner', NULL, 0, '2024-10-01 20:04:56.88818+00', '2024-10-01 20:04:56.88818+00');


--
-- TOC entry 3455 (class 0 OID 17941)
-- Dependencies: 218
-- Data for Name: user_registrations; Type: TABLE DATA; Schema: public; Owner: modulus_owner
--



--
-- TOC entry 3456 (class 0 OID 17956)
-- Dependencies: 219
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: modulus_owner
--

INSERT INTO public.users VALUES ('019249af-95b1-7ee7-a250-02137fc6f3a1', 1, 'Anon Instructor', NULL, 'anon@instructor.org', NULL, '2024-10-01 20:04:56.883403', '2024-10-01 20:04:56.883403', false, '2024-10-01 20:04:56.883403', '0.0.0.0', 0, false, false);
INSERT INTO public.users VALUES ('019249af-95b1-7ee7-a250-0aa64c1a5601', 1, 'Anon Learner', NULL, 'anon@learner.org', NULL, '2024-10-01 20:04:56.883403', '2024-10-01 20:04:56.883403', false, '2024-10-01 20:04:56.883403', '0.0.0.0', 0, false, false);
INSERT INTO public.users VALUES ('019249af-95b1-7ee7-a250-132944743a0b', 1, 'Alice', NULL, 'alice@modulus_owner.org', '$argon2id$v=19$m=65536,t=3,p=4$JpOLJrpSWIzdeuunZcLvYQ$Yb8DDTKxeq6s0cQn+3mhL/RjKT6Yv2iwYkEIH80ZdtU', '2024-10-01 20:04:56.883403', '2024-10-01 20:04:56.883403', false, '2024-10-01 20:04:56.883403', '0.0.0.0', 0, false, false);
INSERT INTO public.users VALUES ('019249af-95b1-7ee7-a250-1a0300277454', 1, 'Bob', NULL, 'bob@modulus_owner.org', '$argon2id$v=19$m=65536,t=3,p=4$JpOLJrpSWIzdeuunZcLvYQ$Yb8DDTKxeq6s0cQn+3mhL/RjKT6Yv2iwYkEIH80ZdtU', '2024-10-01 20:04:56.883403', '2024-10-01 20:04:56.883403', false, '2024-10-01 20:04:56.883403', '0.0.0.0', 0, false, false);
INSERT INTO public.users VALUES ('019249af-95b1-7ee7-a250-23466aec6691', 1, 'Carol', NULL, 'carol@modulus_owner.org', NULL, '2024-10-01 20:04:56.883403', '2024-10-01 20:04:56.883403', false, '2024-10-01 20:04:56.883403', '0.0.0.0', 0, false, false);
INSERT INTO public.users VALUES ('01924ab6-7219-7ffb-92d6-b42df3e762f0', 1, 'Learning 01', 'f9051d874acd8a62', 'aab4b6ba6a2d3373', NULL, '2024-10-02 00:52:03.744898', '2024-10-02 00:52:03.744898', false, '2024-10-02 00:52:03.744898', '0.0.0.0', 0, false, false);


--
-- TOC entry 3470 (class 0 OID 0)
-- Dependencies: 216
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE SET; Schema: drizzle; Owner: modulus_owner
--

SELECT pg_catalog.setval('drizzle.__drizzle_migrations_id_seq', 1, true);


--
-- TOC entry 3266 (class 2606 OID 17940)
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: modulus_owner
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- TOC entry 3288 (class 2606 OID 18006)
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);


--
-- TOC entry 3290 (class 2606 OID 18008)
-- Name: activities activities_url_unique; Type: CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_url_unique UNIQUE (url);


--
-- TOC entry 3294 (class 2606 OID 18022)
-- Name: activity_codes activity_codes_code_unique; Type: CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.activity_codes
    ADD CONSTRAINT activity_codes_code_unique UNIQUE (code);


--
-- TOC entry 3296 (class 2606 OID 18020)
-- Name: activity_codes activity_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.activity_codes
    ADD CONSTRAINT activity_codes_pkey PRIMARY KEY (id);


--
-- TOC entry 3298 (class 2606 OID 18024)
-- Name: activity_codes activity_codes_private_code_unique; Type: CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.activity_codes
    ADD CONSTRAINT activity_codes_private_code_unique UNIQUE (private_code);


--
-- TOC entry 3292 (class 2606 OID 18013)
-- Name: enrollment enrollment_activity_code_id_activity_id_user_id_pk; Type: CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_activity_code_id_activity_id_user_id_pk PRIMARY KEY (activity_code_id, activity_id, user_id);


--
-- TOC entry 3286 (class 2606 OID 17999)
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- TOC entry 3300 (class 2606 OID 18031)
-- Name: progress progress_activity_id_user_id_pk; Type: CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.progress
    ADD CONSTRAINT progress_activity_id_user_id_pk PRIMARY KEY (activity_id, user_id);


--
-- TOC entry 3284 (class 2606 OID 17991)
-- Name: role_user role_user_role_id_user_id_pk; Type: CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.role_user
    ADD CONSTRAINT role_user_role_id_user_id_pk PRIMARY KEY (role_id, user_id);


--
-- TOC entry 3280 (class 2606 OID 17986)
-- Name: roles roles_machine_name_unique; Type: CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_machine_name_unique UNIQUE (machine_name);


--
-- TOC entry 3282 (class 2606 OID 17984)
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- TOC entry 3268 (class 2606 OID 17955)
-- Name: user_registrations user_registrations_email_unique; Type: CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.user_registrations
    ADD CONSTRAINT user_registrations_email_unique UNIQUE (email);


--
-- TOC entry 3270 (class 2606 OID 17951)
-- Name: user_registrations user_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.user_registrations
    ADD CONSTRAINT user_registrations_pkey PRIMARY KEY (id);


--
-- TOC entry 3272 (class 2606 OID 17953)
-- Name: user_registrations user_registrations_username_unique; Type: CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.user_registrations
    ADD CONSTRAINT user_registrations_username_unique UNIQUE (username);


--
-- TOC entry 3274 (class 2606 OID 17973)
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- TOC entry 3276 (class 2606 OID 17969)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 3278 (class 2606 OID 17971)
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- TOC entry 3307 (class 2606 OID 18062)
-- Name: activity_codes activity_codes_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.activity_codes
    ADD CONSTRAINT activity_codes_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3304 (class 2606 OID 18047)
-- Name: enrollment enrollment_activity_code_id_activity_codes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_activity_code_id_activity_codes_id_fk FOREIGN KEY (activity_code_id) REFERENCES public.activity_codes(id) ON DELETE CASCADE;


--
-- TOC entry 3305 (class 2606 OID 18052)
-- Name: enrollment enrollment_activity_id_activities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_activity_id_activities_id_fk FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;


--
-- TOC entry 3306 (class 2606 OID 18057)
-- Name: enrollment enrollment_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3303 (class 2606 OID 18042)
-- Name: permissions permissions_role_id_roles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_role_id_roles_id_fk FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- TOC entry 3308 (class 2606 OID 18067)
-- Name: progress progress_activity_id_activities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.progress
    ADD CONSTRAINT progress_activity_id_activities_id_fk FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;


--
-- TOC entry 3309 (class 2606 OID 18072)
-- Name: progress progress_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.progress
    ADD CONSTRAINT progress_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3301 (class 2606 OID 18032)
-- Name: role_user role_user_role_id_roles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.role_user
    ADD CONSTRAINT role_user_role_id_roles_id_fk FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- TOC entry 3302 (class 2606 OID 18037)
-- Name: role_user role_user_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: modulus_owner
--

ALTER TABLE ONLY public.role_user
    ADD CONSTRAINT role_user_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- Completed on 2024-10-02 08:42:57

--
-- PostgreSQL database dump complete
--

