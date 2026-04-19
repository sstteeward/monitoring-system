import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { notificationService } from '../services/notificationService';
import { timeTrackingService, type Timesheet } from '../services/timeTracking';
import { profileService, type Profile } from '../services/profileService';
import { calculateDistanceInMeters } from '../utils/geoUtils';
import TimesheetView from './TimesheetView';
import PerformanceView from './PerformanceView';
import ProfileView from './ProfileView';
import SettingsView from './SettingsView';
import JournalView from './JournalView';
import AnnouncementsView from './AnnouncementsView';
import DocumentsView from './DocumentsView';
import OnboardingView from './OnboardingView';
import WelcomeCelebration from './WelcomeCelebration';
import ChatWidget from './ChatWidget';
import FeedbackModal from './FeedbackModal';
import GroupStudentsModal from './GroupStudentsModal';
import { DTRCard } from './DTRCard';
import './StudentDashboard.css';

type View = 'dashboard' | 'timesheets' | 'journal' | 'performance' | 'profile' | 'settings' | 'documents' | 'announcement' | 'dtr';

// Anti-Cheat: Emulator & VM Detection Header
const detectEmulator = () => {
    try {
        const isWebDriver = navigator.webdriver || false;
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        let isVirtualGPU = false;
        if (gl) {
            // @ts-ignore
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                // @ts-ignore
                const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)?.toLowerCase() || '';
                isVirtualGPU = renderer.includes('swiftshader') ||
                    renderer.includes('llvmpipe') ||
                    renderer.includes('virtualbox') ||
                    renderer.includes('vmware') ||
                    renderer.includes('bluestacks');
            }
        }
        return isWebDriver || isVirtualGPU;
    } catch (e) {
        return false;
    }
};
// Anti-Cheat: Browser Extension & API Spoofing Detection
const detectSpoofExtension = (position: any) => {
    try {
        if (!position) return 'No position object returned';

        // 1. Prototype Chain Check
        // Real geolocation objects have specific natives. Most basic JS spoofers construct plain Objects.
        if (position && position.constructor && position.constructor.name !== 'GeolocationPosition') {
            return 'Prototype Mismatch (Not GeolocationPosition)';
        }
        if (position && position.coords && position.coords.constructor && position.coords.constructor.name !== 'GeolocationCoordinates') {
            return 'Prototype Mismatch (Not GeolocationCoordinates)';
        }

        // 2. Function Hijack Check
        // Checks if the native browser function was replaced by a content script
        const geoString = navigator.geolocation.getCurrentPosition.toString();
        if (geoString.indexOf('[native code]') === -1) {
            return 'API Hooking Detected (Non-native getCurrentPosition)';
        }

        // 3. Return signature anomaly
        // The native getCurrentPosition STRICTLY returns undefined.
        // Some poorly written spoof promises return Objects or Promises when invoked synchronously.
        const testRet = navigator.geolocation.getCurrentPosition(() => { }, () => { }, { timeout: 1 });
        if (testRet !== undefined) {
            return 'API Intercepted (Invalid return signature)';
        }

        return null; // Passed checks
    } catch (e) {
        console.warn("Spoof extension detector encountered an error:", e);
        return null; // Fail open to avoid blocking legitimate users on browser idiosyncrasies
    }
};

const StudentDashboard: React.FC = () => {
    const [user, setUser] = useState<any>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [session, setSession] = useState<Timesheet | null>(null);
    const [loading, setLoading] = useState(true);
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [elapsed, setElapsed] = useState<string>('00:00:00');
    const [elapsedSecs, setElapsedSecs] = useState(0);
    const [sidebarMode, setSidebarMode] = useState<'expanded' | 'collapsed' | 'hover'>('hover');
    const [isSidebarMenuOpen, setIsSidebarMenuOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [todaySessions, setTodaySessions] = useState<Timesheet[]>([]);
    const [hasNewAnnouncements, setHasNewAnnouncements] = useState(false);
    const [needsOnboarding, setNeedsOnboarding] = useState(false);
    const [showWelcome, setShowWelcome] = useState(false);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
    const [groupModalState, setGroupModalState] = useState<{ isOpen: boolean, title: string, filterType: 'company' | 'department', filterValue: string }>({ isOpen: false, title: '', filterType: 'company', filterValue: '' });
    const [errorModalMsg, setErrorModalMsg] = useState<string | null>(null);
    const [errorModalTitle, setErrorModalTitle] = useState<string>('Error');
    const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const [pendingLocation, setPendingLocation] = useState<{ lat: number, lng: number } | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const timerRef = useRef<number | null>(null);

    const routerNavigate = useNavigate();
    const location = useLocation();

    // Determine current view from pathname
    const lastPart = location.pathname.split('/').pop();
    const currentView: View = (lastPart === '' || lastPart === 'monitoring-system' || lastPart === undefined ? 'dashboard' : lastPart as View) || 'dashboard';

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setUser(data.user));

        // Load everything required before dropping the loading screen
        Promise.all([
            loadSession(),
            loadProfile()
        ]).finally(() => {
            setLoading(false);
        });


        checkAnnouncements();
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, []);

    // Reload profile when navigating between views to pick up approved transfers
    useEffect(() => {
        loadProfile();
    }, [currentView]);

    useEffect(() => {
        const titles: Record<string, string> = {
            dashboard: 'Time Tracking',
            timesheets: 'Timesheets',
            journal: 'Daily Journal',
            performance: 'Performance',
            documents: 'Documents',
            announcement: 'Announcements',
            profile: 'My Profile',
            settings: 'Settings',
            dtr: 'Daily Time Record',
        };
        document.title = `${titles[currentView] ?? 'Dashboard'} | SIL Monitoring`;
    }, [currentView]);

    const checkAnnouncements = async () => {
        try {
            const { data } = await supabase
                .from('announcements')
                .select('created_at')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            if (!data) return;
            const lastSeen = localStorage.getItem('announcements-last-seen');
            if (!lastSeen || new Date(data.created_at) > new Date(lastSeen)) {
                setHasNewAnnouncements(true);
            }
        } catch {
            // No announcements yet — ignore
        }
    };

    const markAnnouncementsSeen = () => {
        localStorage.setItem('announcements-last-seen', new Date().toISOString());
        setHasNewAnnouncements(false);
    };

    const loadProfile = async () => {
        try {
            const data = await profileService.getCurrentProfile();
            setProfile(data);
            // Show onboarding if company hasn't been set yet OR missing crucial new profile fields
            const isMissingFields = !data?.company_id || !data?.course || !data?.department || !data?.year_level;
            if (isMissingFields) {
                setNeedsOnboarding(true);
            }
        } catch (err) {
            console.error('Error loading profile:', err);
        }
    };

    const loadSession = async () => {
        try {
            const current = await timeTrackingService.getCurrentSession();
            setSession(current);
            await loadTodaySessions();
        } catch (err) {
            console.error('Error loading session:', err);
        }
    };

    const loadTodaySessions = async () => {
        try {
            const all = await timeTrackingService.getTimesheets();
            const today = new Date().toLocaleDateString('en-US');
            const filtered = all.filter(ts => new Date(ts.clock_in).toLocaleDateString('en-US') === today);
            setTodaySessions(filtered);
        } catch (err) {
            console.error('Error loading today sessions:', err);
        }
    };

    useEffect(() => {
        if (session?.status === 'working') {
            startTicker();
        } else if (session?.status === 'break') {
            stopTicker();
            setElapsed('On Break');
            setElapsedSecs(0);
        } else {
            stopTicker();
            setElapsed('00:00:00');
            setElapsedSecs(0);
        }
    }, [session]);

    const startTicker = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        updateTimer();
        timerRef.current = window.setInterval(updateTimer, 1000);
    };

    const stopTicker = () => {
        if (timerRef.current) clearInterval(timerRef.current);
    };

    const updateTimer = () => {
        if (!session?.clock_in) return;
        const diff = Math.max(0, Date.now() - new Date(session.clock_in).getTime());
        const total = Math.floor(diff / 1000);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        setElapsedSecs(total);
        setElapsed(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };

    const logAntiCheat = async (reason: string, details: any = {}) => {
        if (!user) {
            console.warn('[AntiCheat] No user session — skipping log');
            return;
        }
        try {
            console.log('[AntiCheat] Logging flag:', reason, details);
            const { error: insertError } = await supabase.from('audit_logs').insert([{
                user_id: user.id,
                action: 'anti_cheat_flag',
                table_name: 'timesheets',
                record_id: null,
                details: { event: 'Clock-In Blocked', reason, ...details }
            }]);

            if (insertError) {
                console.error('[AntiCheat] Failed to insert audit log:', insertError);
            } else {
                console.log('[AntiCheat] Audit log inserted successfully');
            }

            if (profile) {
                await notificationService.notifyAntiCheatFlag(profile, reason);
            }
        } catch (err) {
            console.error('[AntiCheat] Exception:', err);
        }
    };

    const openCameraParams = async () => {
        setIsCameraModalOpen(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            setCameraStream(stream);
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            }, 100);
        } catch (err) {
            console.error("Camera error:", err);
            setErrorModalTitle('Camera Required');
            setErrorModalMsg('You must grant camera access to take a mandatory selfie for attendance verification. Please check your browser site settings.');
            setIsCameraModalOpen(false);
            setIsActionLoading(false);
        }
    };

    const captureSelfieAndClockIn = async () => {
        if (!videoRef.current || !pendingLocation) return;
        setIsActionLoading(true);
        try {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("Could not capture image context");

            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob((b) => {
                    if (b) resolve(b);
                    else reject(new Error("Blob failed"));
                }, 'image/jpeg', 0.8);
            });

            const fileName = `${user.id}_${Date.now()}.jpg`;
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('attendance-photos')
                .upload(fileName, blob, { contentType: 'image/jpeg' });

            if (uploadError) throw new Error("Failed to upload attendance photo.");

            const { data: publicUrlData } = supabase.storage
                .from('attendance-photos')
                .getPublicUrl(uploadData.path);

            const newSession = await timeTrackingService.clockIn(
                pendingLocation.lat || undefined,
                pendingLocation.lng || undefined,
                false,
                publicUrlData.publicUrl
            );

            setSession(newSession);
            await loadTodaySessions();
            closeCameraModal();
        } catch (e: any) {
            setErrorModalTitle('Clock In Error');
            setErrorModalMsg(e.message);
        }
        setIsActionLoading(false);
    };

    const closeCameraModal = () => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
        }
        setIsCameraModalOpen(false);
    };

    const initiateClockIn = async () => {
        try {
            setIsActionLoading(true);

            if (profile?.company?.latitude && profile?.company?.longitude) {
                const companyLat = profile.company.latitude;
                const companyLng = profile.company.longitude;
                const radius = profile.company.geofence_radius || 100; // default 100m

                const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                    if (detectEmulator()) {
                        const err = new Error("Emulator or Virtualized Environment detected. Standard operations require a real mobile device to verify attendance.");
                        (err as any).antiCheatReason = 'Emulator Detected';
                        return reject(err);
                    }
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true, timeout: 10000, maximumAge: 0
                    });
                }).catch((err: GeolocationPositionError | Error) => {
                    if ((err as GeolocationPositionError).code === 1) { // PERMISSION_DENIED
                        throw new Error("You denied location access. Please go to your browser settings, clear permissions for this site, and try again.");
                    }
                    throw err;
                });

                const spoofingState = detectSpoofExtension(position);
                if (spoofingState) {
                    const err = new Error(`Geolocation API spoofing detected. Please disable it and try again.`);
                    (err as any).antiCheatReason = 'Browser Extension Spoofing';
                    (err as any).antiCheatDetails = { flag: spoofingState };
                    throw err;
                }

                const { latitude: userLat, longitude: userLng, altitude, speed, accuracy, heading } = position.coords;

                const timeDiffStr = Math.abs(Date.now() - position.timestamp);
                if (timeDiffStr > 300000) { // 5 minutes discrepancy
                    const err = new Error(" Timing Anomaly detected. The GPS data is stale or spoofed. Please disable any spoofers or refresh your location setting.");
                    (err as any).antiCheatReason = 'Timing Anomaly';
                    (err as any).antiCheatDetails = { timeDiffStr };
                    throw err;
                }

                if (altitude === 0 && speed === 0 && (accuracy === 0 || accuracy === 1) && heading === 0) {
                    const err = new Error(" Suspicious GPS data detected. Please disable any Mock Location or Fake GPS apps, ensure you have a clear view of the sky, and try again.");
                    (err as any).antiCheatReason = 'Fake GPS Signature';
                    throw err;
                }

                const distance = calculateDistanceInMeters(
                    { latitude: userLat, longitude: userLng },
                    { latitude: companyLat, longitude: companyLng }
                );

                if (distance > radius) {
                    const err = new Error(`You are too far from the company premises to clock in. (Distance: ${Math.round(distance)}m, Limit: ${radius}m)`);
                    (err as any).antiCheatReason = 'Geofence Violation';
                    (err as any).antiCheatDetails = { distance: Math.round(distance), radius, userLat, userLng };
                    throw err;
                }

                const lastSession = todaySessions.filter(s => s.clock_out && s.clock_out_latitude && s.clock_out_longitude).pop();
                if (lastSession && lastSession.clock_out_latitude && lastSession.clock_out_longitude && lastSession.clock_out) {
                    const distFromLastOut = calculateDistanceInMeters(
                        { latitude: userLat, longitude: userLng },
                        { latitude: lastSession.clock_out_latitude, longitude: lastSession.clock_out_longitude }
                    );
                    const timeDiffSecs = (new Date().getTime() - new Date(lastSession.clock_out).getTime()) / 1000;
                    const spd = timeDiffSecs > 0 ? distFromLastOut / timeDiffSecs : 0;

                    if (spd > 30 && distFromLastOut > 2000) {
                        const err = new Error(`Suspicious location change detected. You traveled ${Math.round(distFromLastOut)} meters in just ${Math.round(timeDiffSecs / 60)} minutes.`);
                        (err as any).antiCheatReason = 'Teleportation / Speed Anomaly';
                        (err as any).antiCheatDetails = { speed: spd, distFromLastOut, timeDiffSecs };
                        throw err;
                    }
                }

                setIsActionLoading(false);
                setPendingLocation({ lat: userLat, lng: userLng });
                openCameraParams();
                return;
            } else {
                setIsActionLoading(false);
                setPendingLocation({ lat: 0, lng: 0 });
                openCameraParams();
                return;
            }
        }
        catch (e: any) {
            if (e.antiCheatReason) {
                logAntiCheat(e.antiCheatReason, e.antiCheatDetails || {});
            }
            setErrorModalTitle('Clock In Denied');
            setErrorModalMsg(e.message);
            setIsActionLoading(false);
        }
    };


    const handleClockOut = async () => {
        if (!session) return;
        try {
            setIsActionLoading(true);

            // Geofencing Check for Clock Out
            if (profile?.company?.latitude && profile?.company?.longitude) {
                const companyLat = profile.company.latitude;
                const companyLng = profile.company.longitude;
                const radius = profile.company.geofence_radius || 100;

                const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 0
                    });
                }).catch((err: GeolocationPositionError) => {
                    if (err.code === 1) { // PERMISSION_DENIED
                        throw new Error("You denied location access. Please go to your browser settings, clear permissions for this site, and try again.");
                    }
                    throw new Error("Could not get your location. Please check browser permissions. " + err.message);
                });

                const userLat = position.coords.latitude;
                const userLng = position.coords.longitude;

                const distance = calculateDistanceInMeters(
                    { latitude: userLat, longitude: userLng },
                    { latitude: companyLat, longitude: companyLng }
                );

                if (distance > radius) {
                    const err = new Error(`You are too far from the company premises to clock out. (Distance: ${Math.round(distance)}m, Limit: ${radius}m)`);
                    (err as any).antiCheatReason = 'Geofence Violation (Clock-Out)';
                    (err as any).antiCheatDetails = { distance: Math.round(distance), radius, userLat, userLng };
                    throw err;
                }

                await timeTrackingService.clockOut(session.id, userLat, userLng);
            } else {
                await timeTrackingService.clockOut(session.id);
            }

            setSession(null);
            await loadTodaySessions();
        }
        catch (e: any) {
            if (e.antiCheatReason) {
                logAntiCheat(e.antiCheatReason, e.antiCheatDetails || {});
            }
            setErrorModalTitle('Clock Out Error');
            setErrorModalMsg(e.message);
        }
        finally { setIsActionLoading(false); }
    };

    const handleBreak = async () => {
        if (!session) return;
        try {
            setIsActionLoading(true);
            const updated = session.status === 'working'
                ? await timeTrackingService.startBreak(session.id)
                : await timeTrackingService.endBreak(session.id);
            setSession(updated);
            await loadTodaySessions();
        } catch (e) {
            setErrorModalTitle('Timer Error');
            setErrorModalMsg((e as Error).message);
        }
        finally { setIsActionLoading(false); }
    };

    const navigateTo = (view: View) => {
        routerNavigate(view === 'dashboard' ? '/' : `/${view}`);
        setIsMobileMenuOpen(false);
    };

    const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
    const closeMobileMenu = () => setIsMobileMenuOpen(false);

    const MAX_SECS = 8 * 3600;

    // Calculate total seconds worked today from completed sessions
    const completedSessions = todaySessions.filter(ts => ts.status === 'completed');
    const completedSecsToday = completedSessions.reduce((acc, ts) => {
        if (ts.clock_out) {
            const start = new Date(ts.clock_in).getTime();
            const end = new Date(ts.clock_out).getTime();
            return acc + Math.floor((end - start) / 1000);
        }
        return acc;
    }, 0);

    // Dynamic Button Label for Clock Out
    let clockOutLabel = "Clock Out";

    if (session) {
        if (completedSessions.length === 0) clockOutLabel = "Time Out (Morning)";
        else if (completedSessions.length === 1) clockOutLabel = "Time Out (Afternoon)";
        else clockOutLabel = "Clock Out";
    }

    const totalSecsWorkedToday = completedSecsToday + (session?.status === 'working' ? elapsedSecs : 0);
    const progress = Math.min(totalSecsWorkedToday / MAX_SECS, 1);
    const progressPct = Math.round(progress * 100);
    const hoursWorkedStr = (totalSecsWorkedToday / 3600).toFixed(1);
    const statusKey = session?.status ?? 'inactive';

    const clockInTime = session?.clock_in
        ? new Date(session.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : todaySessions.length > 0
            ? new Date(todaySessions[todaySessions.length - 1].clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '—';

    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    // Helper to format email slug to a name (fallback)
    const formatSlug = (slug: string) => {
        return slug
            .split(/[._-]/)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    };

    // Avatar initials from profile name or email
    const initials = profile?.first_name
        ? profile.first_name[0].toUpperCase()
        : user?.email ? user.email[0].toUpperCase() : '?';

    const displayName = profile?.first_name && profile?.last_name
        ? `${profile.first_name} ${profile.last_name}`
        : user?.email
            ? formatSlug(user.email.split('@')[0])
            : 'User';

    const renderView = () => {
        switch (currentView) {
            case 'timesheets': return <TimesheetView />;
            case 'performance': return <PerformanceView />;
            case 'profile': return <ProfileView onProfileUpdated={setProfile} />;
            case 'settings': return <SettingsView />;
            case 'journal': return <JournalView />;
            case 'announcement': return <AnnouncementsView />;
            case 'documents': return <DocumentsView />;
            case 'dtr': return (
                <div className="dtr-view-wrapper">
                    <DTRCard
                        employeeName={displayName}
                        department={profile?.department || profile?.course || ''}
                        position="STUDENT"
                        requiredHours={profile?.required_ojt_hours || 0}
                    />
                </div>
            );
            default: return null;
        }
    };

    if (loading) {
        return (
            <div className="dashboard-container" style={{ justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
                <div className="loading-spinner-container">
                    <div className="loading-pulse-logo">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                    </div>
                </div>
            </div>
        );
    }

    // Show onboarding for students who haven't set their company yet
    if (needsOnboarding && profile) {
        return (
            <OnboardingView
                profile={profile}
                onComplete={async () => {
                    await loadProfile();
                    setNeedsOnboarding(false);
                    setShowWelcome(true);
                }}
            />
        );
    }

    return (
        <>
            {showWelcome && (
                <WelcomeCelebration
                    displayName={displayName}
                    onDismiss={() => setShowWelcome(false)}
                />
            )}
            <div className={`dashboard-container ${isMobileMenuOpen ? 'mobile-menu-open' : ''}`}>
                {/* Mobile Overlay */}
                <div className="mobile-overlay" onClick={closeMobileMenu} />

                {/* ══ SIDEBAR ══ */}
                <aside className={`sidebar sidebar-mode-${sidebarMode} ${isMobileMenuOpen ? ' mobile-open' : ''}`}>
                    {/* Logo & Toggle */}
                    <div className="sidebar-header">
                        <div className="sidebar-logo">
                            <div className="sidebar-logo-icon">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                            </div>
                            <div className="sidebar-logo-text-group">
                                <div className="sidebar-logo-text">SIL Monitoring</div>
                                <div className="sidebar-logo-sub">Asian College Dumaguete</div>
                            </div>
                        </div>
                        {/* Mobile Close Button */}
                        <button className="mobile-close-btn" onClick={closeMobileMenu}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>



                    {/* Nav */}
                    <div className="sidebar-scrollable">
                        <div className="sidebar-section-label">Workspace</div>
                        <nav className="sidebar-nav">
                            <div
                                className={`sidebar-nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
                                title="Dashboard"
                                onClick={() => navigateTo('dashboard')}
                            >
                                <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg></span>
                                <span className="nav-text">Dashboard</span>
                            </div>
                            <div
                                className={`sidebar-nav-item ${currentView === 'timesheets' ? 'active' : ''}`}
                                title="Timesheets"
                                onClick={() => navigateTo('timesheets')}
                            >
                                <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg></span>
                                <span className="nav-text">Timesheets</span>
                            </div>
                            <div
                                className={`sidebar-nav-item ${currentView === 'journal' ? 'active' : ''}`}
                                title="Daily Journal"
                                onClick={() => navigateTo('journal')}
                            >
                                <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg></span>
                                <span className="nav-text">Daily Journal</span>
                            </div>
                            <div
                                className={`sidebar-nav-item ${currentView === 'performance' ? 'active' : ''}`}
                                title="Performance"
                                onClick={() => navigateTo('performance')}
                            >
                                <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg></span>
                                <span className="nav-text">Performance</span>
                            </div>
                            <div
                                className={`sidebar-nav-item ${currentView === 'documents' ? 'active' : ''}`}
                                title="Documents"
                                onClick={() => navigateTo('documents')}
                            >
                                <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg></span>
                                <span className="nav-text">Documents</span>
                            </div>
                            <div
                                className={`sidebar-nav-item ${currentView === 'dtr' ? 'active' : ''}`}
                                title="Daily Time Record"
                                onClick={() => navigateTo('dtr')}
                            >
                                <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg></span>
                                <span className="nav-text">Daily Time Record</span>
                            </div>
                        </nav>

                        <div className="sidebar-section-label">Notifications</div>
                        <nav className="sidebar-nav">
                            <div
                                className={`sidebar-nav-item ${currentView === 'announcement' ? 'active' : ''}`}
                                title="School Announcements"
                                onClick={() => { navigateTo('announcement'); markAnnouncementsSeen(); }}
                                style={{ position: 'relative' }}
                            >
                                <span className="nav-icon" style={{ position: 'relative' }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                                    {hasNewAnnouncements && (
                                        <span style={{
                                            position: 'absolute', top: -3, right: -3,
                                            width: 8, height: 8, borderRadius: '50%',
                                            background: '#10b981',
                                            boxShadow: '0 0 0 2px var(--bg-sidebar)',
                                            display: 'block',
                                        }} />
                                    )}
                                </span>
                                <span className="nav-text">Announcements</span>
                            </div>
                        </nav>

                    </div>

                    {/* Sidebar Control & Logout */}
                    <div className="sidebar-bottom">
                        <div style={{ position: 'relative' }}>
                            {isSidebarMenuOpen && (
                                <>
                                    <div
                                        style={{ position: 'fixed', inset: 0, zIndex: 100 }}
                                        onClick={() => setIsSidebarMenuOpen(false)}
                                    />
                                    <div className="sidebar-control-menu">
                                        <div className="sidebar-control-header">Sidebar control</div>
                                        <div className="sidebar-control-options">
                                            {(['expanded', 'collapsed', 'hover'] as const).map(mode => (
                                                <div
                                                    key={mode}
                                                    className="sidebar-control-option"
                                                    onClick={() => { setSidebarMode(mode); setIsSidebarMenuOpen(false); }}
                                                >
                                                    <div className="sidebar-control-radio">
                                                        {sidebarMode === mode && <div className="sidebar-control-radio-inner" />}
                                                    </div>
                                                    <span style={{ textTransform: 'capitalize' }}>
                                                        {mode === 'hover' ? 'Expand on hover' : mode}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                            <div
                                className={`sidebar-nav-item ${isSidebarMenuOpen ? 'active' : ''}`}
                                onClick={() => setIsSidebarMenuOpen(!isSidebarMenuOpen)}
                                title="Sidebar control"
                                style={{ marginBottom: '0.25rem' }}
                            >
                                <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="3" x2="9" y2="21" /></svg></span>
                                <span className="nav-text">Layout</span>
                            </div>
                        </div>

                        <div
                            className={`sidebar-nav-item ${currentView === 'settings' ? 'active' : ''}`}
                            title="Settings"
                            onClick={() => navigateTo('settings')}
                        >
                            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg></span>
                            <span className="nav-text">Settings</span>
                        </div>

                        <div
                            className="sidebar-nav-item"
                            title="Submit Feedback"
                            onClick={() => { setIsFeedbackModalOpen(true); setIsMobileMenuOpen(false); }}
                        >
                            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg></span>
                            <span className="nav-text">Submit Feedback</span>
                        </div>
                    </div>
                </aside>

                {/* ══ MAIN ══ */}
                <div className="dashboard-main">
                    {/* Topbar */}
                    <div className="topbar">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <button className="mobile-menu-toggle" onClick={toggleMobileMenu}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                            </button>
                            <div>
                                <div className="topbar-title">
                                    {currentView === 'dashboard' && 'Time Tracking'}
                                    {currentView === 'timesheets' && 'Timesheets'}
                                    {currentView === 'journal' && 'Daily Journal'}
                                    {currentView === 'performance' && 'Performance'}
                                    {currentView === 'documents' && 'Documents'}
                                    {currentView === 'announcement' && 'School Announcements'}
                                    {currentView === 'profile' && 'Profile'}
                                    {currentView === 'settings' && 'Settings'}
                                </div>
                                <div className="topbar-date">{dateStr}</div>
                            </div>
                        </div>
                        <div className="topbar-right">
                            <div className="topbar-actions">
                                <div className={`status-pill pill-${statusKey}`}>
                                    <span className="pill-dot" />
                                    <span className="pill-text">
                                        {statusKey === 'working' ? 'Working' : statusKey === 'break' ? 'On Break' : 'Clocked Out'}
                                    </span>
                                </div>
                                <div className="topbar-divider" />
                                <button className="topbar-user-btn" onClick={() => navigateTo('profile')}>
                                    <div className="topbar-user-info">
                                        <div className="topbar-user-name">{displayName}</div>
                                        <div className="topbar-user-role">{profile?.account_type ?? 'BSIT STUDENT'}</div>
                                    </div>
                                    <div className="topbar-avatar" style={{
                                        background: profile?.avatar_url ? `url(${profile.avatar_url}) center/cover no-repeat` : undefined,
                                        color: profile?.avatar_url ? 'transparent' : undefined
                                    }}>
                                        {profile?.avatar_url ? '' : initials}
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Page content */}
                    <div className="page-content">
                        {currentView === 'dashboard' ? (
                            <>
                                {/* ── Greeting Banner ── */}
                                <div className="greeting-banner">
                                    <div className="greeting-banner-text">
                                        <div className="greeting-banner-sub">{greeting},</div>
                                        <div className="greeting-banner-name">{displayName}</div>
                                        <div className="greeting-banner-date">Here's your SIL program snapshot for today.</div>
                                        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                                            <button
                                                onClick={() => {
                                                    if (profile?.company?.name && profile?.company_id) {
                                                        setGroupModalState({ isOpen: true, title: `Students in ${profile.company.name}`, filterType: 'company', filterValue: profile.company_id });
                                                    }
                                                }}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                                    background: 'rgba(255, 255, 255, 0.15)', color: '#ffffff',
                                                    padding: '0.35rem 0.8rem', borderRadius: '8px', fontSize: '0.85rem',
                                                    fontWeight: 600, border: '1px solid rgba(255, 255, 255, 0.25)',
                                                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
                                                    outline: 'none', backdropFilter: 'blur(4px)'
                                                }}
                                                onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)'}
                                                onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                                                title="View peers in company"
                                            >
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                                                {profile?.company?.name || 'No Company Assigned'}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const dept = profile?.department || profile?.course;
                                                    if (dept) {
                                                        setGroupModalState({ isOpen: true, title: `Students in ${dept}`, filterType: 'department', filterValue: dept });
                                                    }
                                                }}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                                    background: 'rgba(255, 255, 255, 0.15)', color: '#ffffff',
                                                    padding: '0.35rem 0.8rem', borderRadius: '8px', fontSize: '0.85rem',
                                                    fontWeight: 600, border: '1px solid rgba(255, 255, 255, 0.25)',
                                                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
                                                    outline: 'none', backdropFilter: 'blur(4px)'
                                                }}
                                                onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)'}
                                                onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                                                title="View peers in department"
                                            >
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c0 2 4 3 6 3s6-1 6-3v-5" /></svg>
                                                {profile?.department || profile?.course || 'No Department'}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="greeting-banner-actions">
                                        <button className="greeting-banner-btn" onClick={() => navigateTo('timesheets')}>
                                            View Timesheets
                                        </button>
                                        <button className="greeting-banner-btn" onClick={() => navigateTo('dtr')}>
                                            Daily Time Record
                                        </button>
                                        <button className="greeting-banner-btn" onClick={() => { navigateTo('announcement'); markAnnouncementsSeen(); }}>
                                            Announcements
                                        </button>
                                    </div>
                                </div>

                                <div className="timer-hero">
                                    {/* Big timer */}
                                    <div className="timer-main-card glass-card">
                                        <div className="timer-label">Elapsed Time</div>
                                        <div className={`timer-clock ${elapsed === 'On Break' ? 'on-break' : ''}`}>
                                            {elapsed}
                                        </div>
                                        <div className="timer-controls" style={{ flexWrap: 'wrap' }}>
                                            {!session ? (
                                                <>

                                                    <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'center' }}>
                                                        <button
                                                            className={`btn btn-shift ${completedSessions.length === 0 ? 'suggested' : ''} ${isActionLoading ? 'loading' : ''}`}
                                                            onClick={initiateClockIn}
                                                            disabled={isActionLoading}
                                                            title="Clock in for morning shift"
                                                        >
                                                            {isActionLoading ? (
                                                                <span className="btn-loading-text">Clocking In...</span>
                                                            ) : (
                                                                <>
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                                                    Time In (Morning)
                                                                </>
                                                            )}
                                                        </button>
                                                        <button
                                                            className={`btn btn-shift ${completedSessions.length === 1 ? 'suggested' : ''} ${isActionLoading ? 'loading' : ''}`}
                                                            onClick={initiateClockIn}
                                                            disabled={isActionLoading}
                                                            title="Clock in for afternoon shift"
                                                        >
                                                            {isActionLoading ? (
                                                                <span className="btn-loading-text">Clocking In...</span>
                                                            ) : (
                                                                <>
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                                                    Time In (Afternoon)
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>

                                                </>

                                            ) : (
                                                <>
                                                    <button
                                                        className={`btn btn-secondary ${session.status === 'break' ? 'active' : ''} ${isActionLoading ? 'loading' : ''}`}
                                                        onClick={handleBreak}
                                                        disabled={isActionLoading}
                                                    >
                                                        {isActionLoading ? (
                                                            <span className="btn-loading-text">Processing...</span>
                                                        ) : (
                                                            session.status === 'break'
                                                                ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg> Resume</>
                                                                : <><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg> Break</>
                                                        )}
                                                    </button>
                                                    <button className={`btn btn-danger ${isActionLoading ? 'loading' : ''}`} onClick={handleClockOut} disabled={isActionLoading}>
                                                        {isActionLoading ? (
                                                            <span className="btn-loading-text">Clocking Out...</span>
                                                        ) : (
                                                            <>
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
                                                                {clockOutLabel}
                                                            </>
                                                        )}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Side info */}
                                    <div className="timer-side-card glass-card">
                                        <div className="side-card-title">Session Info</div>
                                        <div className="info-row">
                                            <div className="info-item">
                                                <span className="info-item-label">Clock In</span>
                                                <span className="info-item-value">{clockInTime}</span>
                                            </div>
                                            <div className="info-item">
                                                <span className="info-item-label">Hours Worked</span>
                                                <span className="info-item-value">{hoursWorkedStr}h</span>
                                            </div>
                                            <div className="info-item">
                                                <span className="info-item-label">Status</span>
                                                <span className={`status-pill ${statusKey}`} style={{ fontSize: '0.72rem' }}>
                                                    <span className="status-dot" />
                                                    {statusKey === 'working' ? 'Working' : statusKey === 'break' ? 'On Break' : 'Inactive'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Progress */}
                                        <div className="progress-wrap">
                                            <div className="progress-header">
                                                <span className="progress-title">Daily Goal (8h)</span>
                                                <span className="progress-pct">{progressPct}%</span>
                                            </div>
                                            <div className="progress-bar-bg">
                                                <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* ── Stats ── */}
                                <div className="stats-row">
                                    <div className="stat-card glass-card">
                                        <span className="stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg></span>
                                        <span className="stat-label">Hours Today</span>
                                        <span className="stat-value">{hoursWorkedStr}</span>
                                        <span className="stat-sub">of 8h target</span>
                                    </div>
                                    <div className="stat-card glass-card">
                                        <span className="stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg></span>
                                        <span className="stat-label">Progress</span>
                                        <span className="stat-value">{progressPct}%</span>
                                        <span className="stat-sub">daily goal</span>
                                    </div>
                                    <div className="stat-card glass-card">
                                        <span className="stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg></span>
                                        <span className="stat-label">Clock In</span>
                                        <span className="stat-value" style={{ fontSize: '1.2rem', paddingTop: '0.3rem' }}>{clockInTime}</span>
                                        <span className="stat-sub">today's start</span>
                                    </div>
                                    <div className="stat-card glass-card">
                                        <span className="stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg></span>
                                        <span className="stat-label">Status</span>
                                        <span className="stat-value" style={{ fontSize: '1rem', paddingTop: '0.4rem' }}>
                                            {statusKey === 'working' ? 'Active' : statusKey === 'break' ? 'On Break' : 'Idle'}
                                        </span>
                                        <span className="stat-sub">current state</span>
                                    </div>
                                </div>

                                {/* ── Activity ── */}
                                <div className="activity-card glass-card">
                                    <div className="activity-header">
                                        <span className="activity-title">Today's Activity</span>
                                    </div>
                                    <div className="activity-list">
                                        {todaySessions.length === 0 && !session ? (
                                            <div className="activity-empty">
                                                <span className="activity-empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2a2d3e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg></span>
                                                <p>Your session history will appear here</p>
                                            </div>
                                        ) : (
                                            <div className="activity-items">
                                                {session && (
                                                    <div className="activity-item active">
                                                        <div className="activity-item-info">
                                                            <span className="activity-item-time">{new Date(session.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – Now</span>
                                                            <span className="activity-item-status">Active Session</span>
                                                        </div>
                                                        <div className="activity-item-duration">{elapsed}</div>
                                                    </div>
                                                )}
                                                {[...todaySessions].reverse().map((ts) => {
                                                    if (ts.id === session?.id) return null;
                                                    const start = new Date(ts.clock_in);
                                                    const end = ts.clock_out ? new Date(ts.clock_out) : null;
                                                    const diff = end ? Math.floor((end.getTime() - start.getTime()) / 1000) : 0;
                                                    const h = Math.floor(diff / 3600);
                                                    const m = Math.floor((diff % 3600) / 60);

                                                    return (
                                                        <div key={ts.id} className="activity-item">
                                                            <div className="activity-item-info">
                                                                <span className="activity-item-time">
                                                                    {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {end ? end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                                                </span>
                                                                <span className="activity-item-status">Completed</span>
                                                            </div>
                                                            <div className="activity-item-duration">{h}h {m}m</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        ) : (
                            renderView()
                        )}
                    </div>
                </div>

                {user && profile && (
                    <ChatWidget currentUser={user} currentProfile={profile} />
                )}

                {user && (
                    <FeedbackModal
                        isOpen={isFeedbackModalOpen}
                        onClose={() => setIsFeedbackModalOpen(false)}
                        userId={user.id}
                    />
                )}

                <GroupStudentsModal
                    isOpen={groupModalState.isOpen}
                    onClose={() => setGroupModalState(prev => ({ ...prev, isOpen: false }))}
                    title={groupModalState.title}
                    filterType={groupModalState.filterType}
                    filterValue={groupModalState.filterValue}
                    currentUserId={user?.id}
                />

                {/* Error Custom Modal */}
                {errorModalMsg && (
                    <div style={{
                        position: 'fixed', inset: 0, zIndex: 1000,
                        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <div className="glass-card" style={{
                            border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: 20, padding: '2rem', width: '90%', maxWidth: 420,
                            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                            animation: 'fadeIn 0.2s ease',
                        }}>
                            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="12" y1="8" x2="12" y2="12"></line>
                                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                </svg>
                            </div>
                            <h3 style={{ textAlign: 'center', color: 'var(--text-primary)', margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 600 }}>{errorModalTitle}</h3>
                            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 1.75rem', lineHeight: 1.5 }}>
                                {errorModalMsg}
                            </p>
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <button
                                    onClick={() => setErrorModalMsg(null)}
                                    style={{ padding: '0.75rem 2.5rem', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(239,68,68,0.35)', transition: 'opacity 0.15s' }}
                                    onMouseOver={e => e.currentTarget.style.opacity = '0.9'}
                                    onMouseOut={e => e.currentTarget.style.opacity = '1'}
                                >
                                    OK
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Camera Modal */}
                {isCameraModalOpen && (
                    <div style={{
                        position: 'fixed', inset: 0, zIndex: 1000,
                        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <div className="glass-card" style={{
                            padding: '1.5rem', width: '90%', maxWidth: 400,
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            borderRadius: '24px', position: 'relative'
                        }}>
                            <h3 style={{ margin: '0 0 1rem', color: 'var(--text-primary)', fontSize: '1.25rem' }}>Attendance Selfie</h3>
                            <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
                                A live selfie is required to verify your identity.
                            </p>

                            <div style={{ width: '100%', borderRadius: 16, overflow: 'hidden', background: '#000', marginBottom: '1.5rem', aspectRatio: '3/4', position: 'relative' }}>
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
                                <button
                                    className="btn btn-secondary"
                                    style={{ flex: 1 }}
                                    onClick={closeCameraModal}
                                    disabled={isActionLoading}
                                >
                                    Cancel
                                </button>
                                <button
                                    className={`btn ${isActionLoading ? 'loading' : ''}`}
                                    style={{ flex: 1, background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))', color: '#fff', border: 'none' }}
                                    onClick={captureSelfieAndClockIn}
                                    disabled={isActionLoading}
                                >
                                    {isActionLoading ? 'Saving...' : 'Capture & Time In'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default StudentDashboard;
