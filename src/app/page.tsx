"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import Dashboard from "@/components/dashboard";

const SLIDES = [
  { src: "/assets/slide1.jpg", alt: "Amali Kitukutu school campus" },
  { src: "/assets/slide2.jpg", alt: "Amali Kitukutu students working" },
  { src: "/assets/slide3.jpg", alt: "Amali Kitukutu technical training" },
  { src: "/assets/slide4.jpg", alt: "Amali Kitukutu classroom" },
];

const PROGRAMS = [
  {
    img: "/assets/electrical.jpg",
    icon: "bolt",
    title: "Electrical Installation",
    desc: "Learn electrical wiring, installation, maintenance, and troubleshooting of electrical systems.",
  },
  {
    img: "/assets/masonry.jpg",
    icon: "building",
    title: "Masonry & Brick Laying",
    desc: "Gain practical skills in construction, brick laying, and building structure development.",
  },
  {
    img: "/assets/programming.jpg",
    icon: "laptop",
    title: "Computer Programming",
    desc: "Learn software development, web development, and modern programming technologies.",
  },
  {
    img: "/assets/electronics.jpg",
    icon: "chip",
    title: "Electronics Repair",
    desc: "Learn electronics troubleshooting, repair, and maintenance of electronic devices.",
  },
];

const GENERAL_COMPULSORY = ["Mathematics", "Kiswahili", "English", "Geography", "Business Studies", "Historia ya Tanzania na Maadili"];
const GENERAL_OPTIONAL = ["Physics", "Chemistry", "Biology"];
const TECHNICAL_COMPULSORY = ["Mathematics", "Business Studies", "English", "Engineering Science", "Historia ya Tanzania na Maadili", "Technical Drawing", "Computer Application with CAD", "Life Skills"];
const TECHNICAL_OPTIONAL = ["Electrical Installation", "Electronics Repair", "Computer Programming", "Masonry and Bricklaying"];

const EDUCATION_LINKS = [
  { label: "NECTA – National Examinations Council of Tanzania", href: "https://www.necta.go.tz" },
  { label: "TAMISEMI – President's Office Regional Administration", href: "https://www.tamisemi.go.tz" },
  { label: "Ministry of Education, Science & Technology", href: "https://www.moe.go.tz" },
  { label: "NACTVET – Vocational & Technical Education", href: "https://www.nactvet.go.tz" },
  { label: "HESLB – Higher Education Students' Loans Board", href: "https://www.heslb.go.tz" },
];

function ProgramIcon({ name }: { name: string }) {
  const common = {
    width: 32,
    height: 32,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "bolt")
    return (
      <svg {...common}>
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    );
  if (name === "building")
    return (
      <svg {...common}>
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <path d="M9 22v-4h6v4" />
        <path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" />
      </svg>
    );
  if (name === "laptop")
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="12" rx="2" />
        <path d="M2 21h20" />
        <path d="M8 9h8" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 2v4M15 2v4M12 9v.01M12 12v.01M12 15v.01M9 12h.01M15 12h.01" />
      <path d="M2 12h4M18 12h4" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

interface PublicExam {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" };
  const d1 = new Date(`${start}T00:00:00`);
  const d2 = new Date(`${end}T00:00:00`);
  const s = d1.toLocaleDateString("en-GB", opts);
  if (end && end !== start && !isNaN(d2.getTime())) {
    return `${s} – ${d2.toLocaleDateString("en-GB", opts)}`;
  }
  return s;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [currentSlide, setCurrentSlide] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [exams, setExams] = useState<PublicExam[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    fetch("/api/public-exams")
      .then((res) => res.json())
      .then((data) => setExams(Array.isArray(data.exams) ? data.exams : []))
      .catch(() => setExams([]));
  }, []);

  const goSlide = useCallback((index: number) => {
    setCurrentSlide((index + SLIDES.length) % SLIDES.length);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentSlide((prev) => (prev + 1) % SLIDES.length), 10000);
    return () => clearInterval(timer);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  if (loading) {
    return (
      <main className="loading-screen">
        <div className="loader">
          <div className="loader-logo">
            <img src="/assets/logo.png" alt="Amali Kitukutu logo" />
          </div>
          <p className="muted">Loading…</p>
        </div>
      </main>
    );
  }

  if (user) return <Dashboard user={user} onLogout={handleLogout} />;

  return (
    <div className="site-landing">
      <div className="top-bar">
        <div className="container site-topbar-row">
          <div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="topbar-icon" width="14" height="14"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 7L2 7" /></svg>
            info@amalikitukutu.unaux.com
          </div>
          <div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="topbar-icon" width="14" height="14"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
            Kitukutu, Iramba, Singida
          </div>
        </div>
      </div>

      <header className="site-header">
        <div className="container header-flex">
          <div className="logo">
            <a href="#home" aria-label="Amali Kitukutu home">
              <img src="/assets/logo.png" alt="Amali Kitukutu Logo" />
            </a>
            <div className="logo-text">
              <strong>Amali Kitukutu</strong>
              <span>Kitukutu Technical Secondary School</span>
            </div>
          </div>
          <nav className="nav-desktop">
            <ul>
              <li><a href="#home">Home</a></li>
              <li><a href="#programs">Programs</a></li>
              <li><a href="#announcements">Announcements</a></li>
              <li><a href="#results">Results</a></li>
              <li><a href="#contact">Contact</a></li>
              <li><a href="/login" className="login-btn"><UserIcon /> Staff Login</a></li>
            </ul>
          </nav>
          <button className="hamburger" onClick={() => setMobileNavOpen((prev) => !prev)} aria-label="Menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="20" height="20"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
          </button>
        </div>
        <div className={`mobile-nav${mobileNavOpen ? " open" : ""}`}>
          <a href="#home" onClick={() => setMobileNavOpen(false)}>Home</a>
          <a href="#programs" onClick={() => setMobileNavOpen(false)}>Programs</a>
          <a href="#announcements" onClick={() => setMobileNavOpen(false)}>Announcements</a>
          <a href="#results" onClick={() => setMobileNavOpen(false)}>Results</a>
          <a href="#contact" onClick={() => setMobileNavOpen(false)}>Contact</a>
          <a className="m-login" href="/login"><UserIcon /> Staff Login</a>
        </div>
      </header>

      <section className="hero-slider" id="home">
        {SLIDES.map((slide, index) => (
          <div
            key={slide.src}
            className={`slide${index === currentSlide ? " active" : ""}`}
            style={{ backgroundImage: `url('${slide.src}')` }}
            role="img"
            aria-label={slide.alt}
            aria-hidden={index !== currentSlide}
          />
        ))}
        <div className="hero-overlay">
          <div className="container">
            <h1>Amali Kitukutu – Kitukutu Technical Secondary School</h1>
            <div className="hero-actions">
              <a className="btn" href="/login"><UserIcon /> Staff Login</a>
              <a className="btn btn-gold" href="#results">Angalia Matokeo</a>
            </div>
          </div>
        </div>
        <div className="slider-dots">
          {SLIDES.map((_, index) => (
            <span key={index} className={`dot${index === currentSlide ? " active" : ""}`} onClick={() => goSlide(index)} />
          ))}
        </div>
      </section>

      <section className="history-section">
        <div className="container">
          <h2>Our History</h2>
          <div className="history-divider" />
          <p>
            Established in 2026, our school proudly welcomed its first Form One class as the beginning of a
            long-term vision of academic excellence and character development. Although we are a newly founded
            institution, we are built on strong foundations of professionalism, innovation, and commitment to quality education.
            <br /><br />
            From the very beginning, we have positioned ourselves to provide outstanding educational services
            through qualified teachers, modern teaching approaches, and a disciplined learning environment.
            Our focus is not only on academic success but also on nurturing responsible, confident, and goal-oriented students.
            <br /><br />
            As we grow, our mission remains clear — to achieve exceptional academic performance and to build
            a reputation as a center of excellence known for producing high-achieving and well-rounded graduates.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-title">Our Identity</h2>
          <div className="identity-grid">
            <div className="identity-card">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="icon-lg"><path d="M3 21c3-1 5-2.5 5-5v-1.5A3 3 0 0 0 2 15.5V21Z" /><path d="M9 11c3 0 5 2 5 5h0c0 3-2 5-5 5V11Z" /><path d="M12 5h9M17 11h4M17 17h4" /></svg>
              <h3>Our Motto</h3>
              <p>Where skills become careers.</p>
            </div>
            <div className="identity-card">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="icon-lg"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
              <h3>Our Vision</h3>
              <p>To become a leading technical and vocational training institution producing competent and innovative professionals.</p>
            </div>
            <div className="identity-card">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="icon-lg"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></svg>
              <h3>Our Mission</h3>
              <p>To provide quality vocational education and practical skills that empower students to succeed in employment and self-reliance.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="programs">
        <div className="container">
          <h2 className="section-title">Academic Streams</h2>
          <p className="section-subtitle">We offer both General Education and Technical (Vocational) Education streams.</p>

          <div className="streams">
            <div className="stream-card">
              <div className="stream-header general"><h3>General Education</h3></div>
              <div className="stream-body">
                <div className="subject-group">
                  <h4>Compulsory Subjects</h4>
                  <ul>{GENERAL_COMPULSORY.map((subject) => <li key={subject}>{subject}</li>)}</ul>
                </div>
                <div className="subject-group">
                  <h4>Optional Subjects</h4>
                  <ul>{GENERAL_OPTIONAL.map((subject) => <li key={subject}>{subject}</li>)}</ul>
                </div>
              </div>
            </div>

            <div className="stream-card">
              <div className="stream-header technical"><h3>Technical (Vocational) Education</h3></div>
              <div className="stream-body">
                <div className="subject-group">
                  <h4>Compulsory Subjects</h4>
                  <ul>{TECHNICAL_COMPULSORY.map((subject) => <li key={subject}>{subject}</li>)}</ul>
                </div>
                <div className="subject-group">
                  <h4>Optional Subjects</h4>
                  <ul>{TECHNICAL_OPTIONAL.map((subject) => <li key={subject}>{subject}</li>)}</ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-alt" id="announcements">
        <div className="container">
          <h2 className="section-title">Latest Announcements</h2>
          <div className="grid">
            {exams.length > 0 ? (
              exams.slice(0, 6).map((exam) => (
                <div key={exam.id} className="card announcement">
                  <div className="date-badge">{formatDateRange(exam.start_date, exam.end_date)}</div>
                  <h3>{exam.name}</h3>
                  <p>Matokeo ya mtihani huu yamechapishwa. Bonyeza Angalia Matokeo kuona matokeo kamili.</p>
                  <a href={`/results?exam=${exam.id}`} className="btn btn-sm">Angalia Matokeo</a>
                </div>
              ))
            ) : (
              <div className="card"><p>No announcements available at the moment.</p></div>
            )}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-title">Training Programs Offered</h2>
          <p className="section-subtitle">We provide hands-on vocational training programs to prepare students for real-world careers.</p>
          <div className="grid">
            {PROGRAMS.map((program) => (
              <div key={program.title} className="card">
                <img src={program.img} alt={program.title} />
                <ProgramIcon name={program.icon} />
                <h3>{program.title}</h3>
                <p>{program.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="results-section" id="results">
        <div className="results-container">
          <div className="results-header">
            <h2 className="results-title">Matokeo ya Mitihani</h2>
            <p className="results-subtitle">Tafuta jina la mwanafunzi na uone matokeo yake ya mtihani husika bila kuingia</p>
          </div>
          <div className="results-grid">
            {exams.length > 0 ? (
              exams.map((exam) => (
                <div key={exam.id} className="result-card">
                  <div className="card-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                  </div>
                  <div className="card-content">
                    <h3>{exam.name}</h3>
                    <p>Mtihani wa Shule</p>
                    <span className="exam-date">{formatDateRange(exam.start_date, exam.end_date)}</span>
                  </div>
                  <a href={`/results?exam=${exam.id}`} className="btn-view">
                    Angalia Matokeo
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </a>
                </div>
              ))
            ) : (
              <div className="results-empty">
                <p style={{ fontSize: 15, fontWeight: 600, color: "#495057", marginBottom: 6 }}>Hakuna matokeo kwa sasa</p>
                <p style={{ fontSize: 13 }}>Matokeo ya mitihani yataonekana hapa baada ya kuchapishwa.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="section section-alt" id="contact">
        <div className="container">
          <h2 className="section-title">Contact Us</h2>
          <div className="contact-wrapper">
            <div className="contact-left">
              <h3>Get in Touch</h3>
              <div className="contact-item">
                <svg viewBox="0 0 24 24" fill="currentColor" className="whatsapp-icon"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" /></svg>
                <a href="https://wa.me/255714951475" target="_blank" rel="noopener">Head of School</a>
              </div>
              <div className="contact-item">
                <svg viewBox="0 0 24 24" fill="currentColor" className="whatsapp-icon"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" /></svg>
                <a href="https://wa.me/255752463910" target="_blank" rel="noopener">Second Master&apos;s Office</a>
              </div>
              <div className="contact-item">
                <svg viewBox="0 0 24 24" fill="currentColor" className="whatsapp-icon"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" /></svg>
                <a href="https://wa.me/255712978722" target="_blank" rel="noopener">Academic Office</a>
              </div>
              <div className="contact-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mail-icon"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 7L2 7" /></svg>
                <a href="mailto:info@amalikitukutu.unaux.com">info@amalikitukutu.unaux.com</a>
              </div>
            </div>

            <div className="contact-right">
              <h3>Send Message</h3>
              <form
                className="contact-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const name = String(data.get("name") ?? "");
                  const senderEmail = String(data.get("email") ?? "");
                  const message = String(data.get("message") ?? "");
                  const subject = encodeURIComponent(`Message from ${name}`);
                  const body = encodeURIComponent(`${message}\n\nFrom: ${name} <${senderEmail}>`);
                  window.location.href = `mailto:info@amalikitukutu.unaux.com?subject=${subject}&body=${body}`;
                }}
              >
                <input type="text" name="name" placeholder="Your Name" required />
                <input type="email" name="email" placeholder="Your Email" required />
                <textarea name="message" placeholder="Write your message here..." required />
                <button className="btn" type="submit">Send Message</button>
              </form>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <div className="footer-logo"><img src="/assets/logo.png" alt="" /><h3>Amali Kitukutu</h3></div>
              <p>Amali Kitukutu Technical School is a vocational training institution dedicated to providing practical skills in Electrical Installation, Masonry, Computer Programming, and Electronics Repair.</p>
            </div>
            <div>
              <h3>Quick Links</h3>
              <ul>
                <li><a href="#home">Home</a></li>
                <li><a href="#programs">Programs</a></li>
                <li><a href="#announcements">Announcements</a></li>
                <li><a href="#results">Results</a></li>
                <li><a href="#contact">Contact</a></li>
              </ul>
            </div>
            <div>
              <h3>Useful Education Links</h3>
              <ul className="useful-links">
                {EDUCATION_LINKS.map((link) => (
                  <li key={link.href}><a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Office Hours</h3>
              <p>Monday – Friday: 7:30 AM – 5:00 PM</p>
              <p>Saturday: 8:00 AM – 1:00 PM</p>
              <p>Sunday: Closed</p>
            </div>
          </div>
          <div className="footer-bottom">© 2026 Amali Kitukutu Technical School School Management System | All Rights Reserved</div>
        </div>
      </footer>
    </div>
  );
}