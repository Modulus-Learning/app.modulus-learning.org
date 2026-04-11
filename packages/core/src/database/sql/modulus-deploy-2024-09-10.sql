--
-- PostgreSQL database dump
--

-- Dumped from database version 16.3 (Debian 16.3-1.pgdg120+1)
-- Dumped by pg_dump version 16.4

-- Started on 2024-09-19 15:24:43

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
-- TOC entry 218 (class 1259 OID 17425)
-- Name: activities; Type: TABLE; Schema: public; Owner: modulus
--

CREATE TABLE public.activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    url character varying(255) NOT NULL
);


ALTER TABLE public.activities OWNER TO modulus_owner;

--
-- TOC entry 220 (class 1259 OID 17438)
-- Name: activity_codes; Type: TABLE; Schema: public; Owner: modulus
--

CREATE TABLE public.activity_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    code character varying(255) NOT NULL,
    private_code character varying(255) NOT NULL
);


ALTER TABLE public.activity_codes OWNER TO modulus_owner;

--
-- TOC entry 219 (class 1259 OID 17433)
-- Name: enrollment; Type: TABLE; Schema: public; Owner: modulus
--

CREATE TABLE public.enrollment (
    activity_code_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    user_id uuid NOT NULL
);


ALTER TABLE public.enrollment OWNER TO modulus_owner;

--
-- TOC entry 221 (class 1259 OID 17450)
-- Name: progress; Type: TABLE; Schema: public; Owner: modulus
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
-- TOC entry 222 (class 1259 OID 17457)
-- Name: user_registrations; Type: TABLE; Schema: public; Owner: modulus
--

CREATE TABLE public.user_registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name character varying(50) NOT NULL,
    username character varying(26),
    email character varying(50),
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
-- TOC entry 223 (class 1259 OID 17473)
-- Name: users; Type: TABLE; Schema: public; Owner: modulus
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vid integer DEFAULT 1 NOT NULL,
    full_name character varying(50),
    username character varying(26),
    email character varying(50),
    password character varying(128) DEFAULT ''::character varying NOT NULL,
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
-- TOC entry 3430 (class 0 OID 17425)
-- Dependencies: 218
-- Data for Name: activities; Type: TABLE DATA; Schema: public; Owner: modulus
--

INSERT INTO public.activities VALUES ('c78d5cc1-a70d-493f-967c-ae3263195778', 'https://ximera.osu.edu/mooculus/calculus1/whatIsALimit/breakGround');
INSERT INTO public.activities VALUES ('177ce6f0-da29-44ed-ad2f-049397cc3b93', 'https://ximera.osu.edu/mooculus/calculus1/whatIsALimit/digInWhatIsALimit');
INSERT INTO public.activities VALUES ('4d53a599-3d66-4839-9c7c-9511c9d555db', 'https://ximera.osu.edu/mooculus/calculus1/whatIsALimit/digInContinuity');
INSERT INTO public.activities VALUES ('6c9dd64b-2150-4f15-a3a1-ba044918c1ca', 'https://ximera.osu.edu/mooculus/calculus1/limitLaws/breakGround');
INSERT INTO public.activities VALUES ('6deefcad-cb18-4614-85fa-6d6a2602a034', 'https://ximera.osu.edu/mooculus/calculus1/limitLaws/digInLimitLaws');
INSERT INTO public.activities VALUES ('4b5cda7e-d717-405a-833a-f87f7616f1ae', 'https://ximera.osu.edu/mooculus/calculus1/limitLaws/digInTheSqueezeTheorem');
INSERT INTO public.activities VALUES ('a9da3425-460b-4548-b5c6-4fbf2655eb70', 'https://foo.com');


--
-- TOC entry 3432 (class 0 OID 17438)
-- Dependencies: 220
-- Data for Name: activity_codes; Type: TABLE DATA; Schema: public; Owner: modulus
--

INSERT INTO public.activity_codes VALUES ('ce4aec29-357f-41c1-8d96-5c1a6584c5ce', '35419dee-f67e-4b17-8cd2-dfefbf38f982', 'my-course-101', '98fj98jloawifj');
INSERT INTO public.activity_codes VALUES ('9fd58694-a2fd-49ac-8db1-9ab799293875', '35419dee-f67e-4b17-8cd2-dfefbf38f982', 'my-course-202', 'fejwaoifoeweif');
INSERT INTO public.activity_codes VALUES ('5779544b-a288-45b4-a79a-683c859d67fd', 'a2fc3afd-3b50-49f1-9bb7-0df9a1d6971c', 'algebra-2', 'ofjwiejf23fa9w');
INSERT INTO public.activity_codes VALUES ('82a9c029-99d1-4b5f-a96b-401263c5cb81', '2c29aa09-061a-4195-8df8-83a9d523dfee', 'calc-101', 'f389fj98f23382');
INSERT INTO public.activity_codes VALUES ('b9bd3047-d452-4636-bc84-6710776fcfa8', '35419dee-f67e-4b17-8cd2-dfefbf38f982', 'algebra-101', 'a3c2f5302d9328f5');


--
-- TOC entry 3431 (class 0 OID 17433)
-- Dependencies: 219
-- Data for Name: enrollment; Type: TABLE DATA; Schema: public; Owner: modulus
--

INSERT INTO public.enrollment VALUES ('ce4aec29-357f-41c1-8d96-5c1a6584c5ce', 'c78d5cc1-a70d-493f-967c-ae3263195778', 'fe29d9a6-de19-4eb2-b05f-2004291eb28e');
INSERT INTO public.enrollment VALUES ('ce4aec29-357f-41c1-8d96-5c1a6584c5ce', '177ce6f0-da29-44ed-ad2f-049397cc3b93', 'fe29d9a6-de19-4eb2-b05f-2004291eb28e');
INSERT INTO public.enrollment VALUES ('ce4aec29-357f-41c1-8d96-5c1a6584c5ce', '4d53a599-3d66-4839-9c7c-9511c9d555db', 'fe29d9a6-de19-4eb2-b05f-2004291eb28e');
INSERT INTO public.enrollment VALUES ('b9bd3047-d452-4636-bc84-6710776fcfa8', 'a9da3425-460b-4548-b5c6-4fbf2655eb70', '5dac6b1b-8a53-45c7-bc78-bf2ca5e99e8a');


--
-- TOC entry 3433 (class 0 OID 17450)
-- Dependencies: 221
-- Data for Name: progress; Type: TABLE DATA; Schema: public; Owner: modulus
--

INSERT INTO public.progress VALUES ('c78d5cc1-a70d-493f-967c-ae3263195778', 'fe29d9a6-de19-4eb2-b05f-2004291eb28e', 1, '2024-09-17 03:17:34.77468+00', '2024-09-17 03:17:34.77468+00');
INSERT INTO public.progress VALUES ('177ce6f0-da29-44ed-ad2f-049397cc3b93', 'fe29d9a6-de19-4eb2-b05f-2004291eb28e', 0.33, '2024-09-17 03:17:34.77468+00', '2024-09-17 03:17:34.77468+00');
INSERT INTO public.progress VALUES ('4d53a599-3d66-4839-9c7c-9511c9d555db', 'fe29d9a6-de19-4eb2-b05f-2004291eb28e', 0, '2024-09-17 03:17:34.77468+00', '2024-09-17 03:17:34.77468+00');


--
-- TOC entry 3434 (class 0 OID 17457)
-- Dependencies: 222
-- Data for Name: user_registrations; Type: TABLE DATA; Schema: public; Owner: modulus
--

--
-- TOC entry 3435 (class 0 OID 17473)
-- Dependencies: 223
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: modulus
--

INSERT INTO public.users VALUES ('35419dee-f67e-4b17-8cd2-dfefbf38f982', 1, 'Anon Instructor', 'anon_instructor', 'anon@instructor.org', '', '2024-09-17 03:17:34.756891', '2024-09-17 03:17:34.756891', false, '2024-09-17 03:17:34.756891', '0.0.0.0', 0, false, false);
INSERT INTO public.users VALUES ('fe29d9a6-de19-4eb2-b05f-2004291eb28e', 1, 'Anon Learner', 'anon_learner', 'anon@learner.org', '', '2024-09-17 03:17:34.756891', '2024-09-17 03:17:34.756891', false, '2024-09-17 03:17:34.756891', '0.0.0.0', 0, false, false);
INSERT INTO public.users VALUES ('a2fc3afd-3b50-49f1-9bb7-0df9a1d6971c', 1, 'Alice', 'alice', 'alice@modulus.org', '', '2024-09-17 03:17:34.756891', '2024-09-17 03:17:34.756891', false, '2024-09-17 03:17:34.756891', '0.0.0.0', 0, false, false);
INSERT INTO public.users VALUES ('2c29aa09-061a-4195-8df8-83a9d523dfee', 1, 'Bob', 'bob', 'bob@modulus.org', '', '2024-09-17 03:17:34.756891', '2024-09-17 03:17:34.756891', false, '2024-09-17 03:17:34.756891', '0.0.0.0', 0, false, false);
INSERT INTO public.users VALUES ('2ccd611d-d7e5-4c8b-abf1-1a964e79e674', 1, 'Carol', 'carol', 'carol@modulus.org', '', '2024-09-17 03:17:34.756891', '2024-09-17 03:17:34.756891', false, '2024-09-17 03:17:34.756891', '0.0.0.0', 0, false, false);
INSERT INTO public.users VALUES ('5dac6b1b-8a53-45c7-bc78-bf2ca5e99e8a', 1, 'Foo', '2bfcdc91d3518131', '5576b917be4478f6', '', '2024-09-17 03:18:16.660949', '2024-09-17 03:18:16.660949', false, '2024-09-17 03:18:16.660949', '0.0.0.0', 0, false, false);


--
-- TOC entry 3254 (class 2606 OID 17430)
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: public; Owner: modulus
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);


--
-- TOC entry 3256 (class 2606 OID 17432)
-- Name: activities activities_url_unique; Type: CONSTRAINT; Schema: public; Owner: modulus
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_url_unique UNIQUE (url);


--
-- TOC entry 3260 (class 2606 OID 17447)
-- Name: activity_codes activity_codes_code_unique; Type: CONSTRAINT; Schema: public; Owner: modulus
--

ALTER TABLE ONLY public.activity_codes
    ADD CONSTRAINT activity_codes_code_unique UNIQUE (code);


--
-- TOC entry 3262 (class 2606 OID 17445)
-- Name: activity_codes activity_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: modulus
--

ALTER TABLE ONLY public.activity_codes
    ADD CONSTRAINT activity_codes_pkey PRIMARY KEY (id);


--
-- TOC entry 3264 (class 2606 OID 17449)
-- Name: activity_codes activity_codes_private_code_unique; Type: CONSTRAINT; Schema: public; Owner: modulus
--

ALTER TABLE ONLY public.activity_codes
    ADD CONSTRAINT activity_codes_private_code_unique UNIQUE (private_code);


--
-- TOC entry 3258 (class 2606 OID 17437)
-- Name: enrollment enrollment_activity_code_id_activity_id_user_id_pk; Type: CONSTRAINT; Schema: public; Owner: modulus
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_activity_code_id_activity_id_user_id_pk PRIMARY KEY (activity_code_id, activity_id, user_id);


--
-- TOC entry 3266 (class 2606 OID 17456)
-- Name: progress progress_activity_id_user_id_pk; Type: CONSTRAINT; Schema: public; Owner: modulus
--

ALTER TABLE ONLY public.progress
    ADD CONSTRAINT progress_activity_id_user_id_pk PRIMARY KEY (activity_id, user_id);


--
-- TOC entry 3268 (class 2606 OID 17472)
-- Name: user_registrations user_registrations_email_unique; Type: CONSTRAINT; Schema: public; Owner: modulus
--

ALTER TABLE ONLY public.user_registrations
    ADD CONSTRAINT user_registrations_email_unique UNIQUE (email);


--
-- TOC entry 3270 (class 2606 OID 17468)
-- Name: user_registrations user_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: modulus
--

ALTER TABLE ONLY public.user_registrations
    ADD CONSTRAINT user_registrations_pkey PRIMARY KEY (id);


--
-- TOC entry 3272 (class 2606 OID 17470)
-- Name: user_registrations user_registrations_username_unique; Type: CONSTRAINT; Schema: public; Owner: modulus
--

ALTER TABLE ONLY public.user_registrations
    ADD CONSTRAINT user_registrations_username_unique UNIQUE (username);


--
-- TOC entry 3274 (class 2606 OID 17492)
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: modulus
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- TOC entry 3276 (class 2606 OID 17488)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: modulus
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 3278 (class 2606 OID 17490)
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: modulus
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- TOC entry 3282 (class 2606 OID 17508)
-- Name: activity_codes activity_codes_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: modulus
--

ALTER TABLE ONLY public.activity_codes
    ADD CONSTRAINT activity_codes_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3279 (class 2606 OID 17493)
-- Name: enrollment enrollment_activity_code_id_activity_codes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: modulus
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_activity_code_id_activity_codes_id_fk FOREIGN KEY (activity_code_id) REFERENCES public.activity_codes(id) ON DELETE CASCADE;


--
-- TOC entry 3280 (class 2606 OID 17498)
-- Name: enrollment enrollment_activity_id_activities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: modulus
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_activity_id_activities_id_fk FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;


--
-- TOC entry 3281 (class 2606 OID 17503)
-- Name: enrollment enrollment_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: modulus
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3283 (class 2606 OID 17513)
-- Name: progress progress_activity_id_activities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: modulus
--

ALTER TABLE ONLY public.progress
    ADD CONSTRAINT progress_activity_id_activities_id_fk FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;


--
-- TOC entry 3284 (class 2606 OID 17518)
-- Name: progress progress_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: modulus
--

ALTER TABLE ONLY public.progress
    ADD CONSTRAINT progress_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- Completed on 2024-09-19 15:24:43

--
-- PostgreSQL database dump complete
--

