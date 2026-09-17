'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { BusinessService } from '@/services/business.service';
import { Business, ServiceItem, DayHours } from '@/types/business';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Building2, 
  Wrench, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  Plus, 
  Trash2,
  AlertCircle,
  ShieldCheck,
  Check
} from 'lucide-react';

const defaultHVACServices: ServiceItem[] = [
  { id: 'ac_repair', name: 'AC Repair', description: 'Diagnose and fix air conditioning breakdowns', enabled: true },
  { id: 'ac_install', name: 'AC Installation', description: 'Install high-efficiency AC systems', enabled: true },
  { id: 'ac_tuneup', name: 'AC Maintenance & Tune-Up', description: 'Seasonal maintenance & filter inspection', enabled: true },
  { id: 'heating_repair', name: 'Heating Repair', description: 'Fix furnace & heat pump issues', enabled: true },
  { id: 'heating_install', name: 'Heating Installation', description: 'Furnaces and heat pump system installs', enabled: true },
  { id: 'ductwork', name: 'Ductwork & Airflow', description: 'Duct cleaning, repair, and sealing', enabled: false },
  { id: 'indoor_air', name: 'Indoor Air Quality', description: 'Air filtration, UV purifiers, and humidifiers', enabled: false },
  { id: 'emergency_hvac', name: 'Emergency HVAC Service', description: '24/7 urgent heating and cooling response', enabled: true },
];

const defaultHours: DayHours[] = [
  { day: 'Monday', isOpen: true, openTime: '08:00', closeTime: '18:00' },
  { day: 'Tuesday', isOpen: true, openTime: '08:00', closeTime: '18:00' },
  { day: 'Wednesday', isOpen: true, openTime: '08:00', closeTime: '18:00' },
  { day: 'Thursday', isOpen: true, openTime: '08:00', closeTime: '18:00' },
  { day: 'Friday', isOpen: true, openTime: '08:00', closeTime: '18:00' },
  { day: 'Saturday', isOpen: true, openTime: '09:00', closeTime: '15:00' },
  { day: 'Sunday', isOpen: false, openTime: '09:00', closeTime: '15:00' },
];

const steps = [
  { id: 1, name: 'Business Profile', icon: Building2 },
  { id: 2, name: 'Services', icon: Wrench },
  { id: 3, name: 'Service Area', icon: MapPin },
  { id: 4, name: 'Hours & Emergency', icon: Clock },
  { id: 5, name: 'Review', icon: CheckCircle2 },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [pageLoading, setPageLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Step 1: Business Profile
  const [name, setName] = useState('');
  const [businessType, setBusinessType] = useState('HVAC');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('TX');
  const [zip, setZip] = useState('');

  // Step 2: Services
  const [services, setServices] = useState<ServiceItem[]>(defaultHVACServices);
  const [customServiceName, setCustomServiceName] = useState('');

  // Step 3: Service Area
  const [primaryCity, setPrimaryCity] = useState('');
  const [areaState, setAreaState] = useState('TX');
  const [areaZip, setAreaZip] = useState('');
  const [radiusMiles, setRadiusMiles] = useState<number>(30);

  // Step 4: Hours & Emergency
  const [hours, setHours] = useState<DayHours[]>(defaultHours);
  const [emergencyOffered, setEmergencyOffered] = useState<boolean>(true);
  const [emergencyAvailability, setEmergencyAvailability] = useState<'24/7' | 'after_hours' | 'custom'>('24/7');

  // Load existing business if already started
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push('/login');
      return;
    }

    const loadBusiness = async () => {
      try {
        const business = await BusinessService.getMyBusiness();
        if (business) {
          if (business.onboardingStatus === 'completed') {
            router.push('/app');
            return;
          }

          setName(business.name || '');
          if (business.businessType) setBusinessType(business.businessType);
          setPhone(business.phone || '');
          setEmail(business.email || '');
          setWebsite(business.website || '');
          if (business.address) {
            setStreet(business.address.street || '');
            setCity(business.address.city || '');
            setState(business.address.state || 'TX');
            setZip(business.address.zip || '');
          }
          if (business.services && business.services.length > 0) {
            setServices(business.services);
          }
          if (business.serviceArea) {
            setPrimaryCity(business.serviceArea.primaryCity || '');
            setAreaState(business.serviceArea.state || 'TX');
            setAreaZip(business.serviceArea.zip || '');
            if (business.serviceArea.radiusMiles) setRadiusMiles(business.serviceArea.radiusMiles);
          }
          if (business.businessHours && business.businessHours.length > 0) {
            setHours(business.businessHours);
          }
          if (business.emergencyService) {
            setEmergencyOffered(business.emergencyService.offered);
            if (business.emergencyService.availability) {
              setEmergencyAvailability(business.emergencyService.availability);
            }
          }

          // Restore appropriate step
          switch (business.onboardingStep) {
            case 'services':
              setCurrentStep(2);
              break;
            case 'service_area':
              setCurrentStep(3);
              break;
            case 'hours':
              setCurrentStep(4);
              break;
            case 'review':
              setCurrentStep(5);
              break;
            default:
              setCurrentStep(1);
          }
        }
      } catch (err) {
        console.error('Failed to load business:', err);
      } finally {
        setPageLoading(false);
      }
    };

    if (isAuthenticated) {
      loadBusiness();
    }
  }, [isAuthenticated, isAuthLoading, router]);

  // Handle Step 1 Submit
  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Business name is required');
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);

    try {
      await BusinessService.saveProfile({
        name: name.trim(),
        businessType,
        phone: phone.trim(),
        email: email.trim(),
        website: website.trim(),
        address: { street, city, state, zip },
      });
      // Pre-fill primary city in service area if empty
      if (!primaryCity && city) setPrimaryCity(city);
      if (!areaZip && zip) setAreaZip(zip);
      setCurrentStep(2);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save business profile');
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle service enabled state
  const toggleService = (id: string) => {
    setServices((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  };

  // Add custom service
  const addCustomService = () => {
    if (!customServiceName.trim()) return;
    const newService: ServiceItem = {
      id: `custom_${Date.now()}`,
      name: customServiceName.trim(),
      description: 'Custom service offering',
      enabled: true,
    };
    setServices((prev) => [...prev, newService]);
    setCustomServiceName('');
  };

  // Handle Step 2 Submit
  const handleStep2 = async () => {
    const hasEnabled = services.some((s) => s.enabled);
    if (!hasEnabled) {
      setErrorMessage('Please select at least one service');
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);

    try {
      await BusinessService.updateServices(services);
      setCurrentStep(3);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save services');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Step 3 Submit
  const handleStep3 = async () => {
    setErrorMessage(null);
    setIsLoading(true);

    try {
      await BusinessService.updateServiceArea({
        primaryCity: primaryCity.trim(),
        state: areaState.trim(),
        zip: areaZip.trim(),
        radiusMiles: Number(radiusMiles),
      });
      setCurrentStep(4);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save service area');
    } finally {
      setIsLoading(false);
    }
  };

  // Update hour row
  const updateHourRow = (dayName: string, field: keyof DayHours, value: any) => {
    setHours((prev) =>
      prev.map((h) => (h.day === dayName ? { ...h, [field]: value } : h))
    );
  };

  // Copy Monday hours to weekdays
  const copyMondayHours = () => {
    const mon = hours.find((h) => h.day === 'Monday');
    if (!mon) return;
    setHours((prev) =>
      prev.map((h) => {
        if (['Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(h.day)) {
          return { ...h, isOpen: mon.isOpen, openTime: mon.openTime, closeTime: mon.closeTime };
        }
        return h;
      })
    );
  };

  // Handle Step 4 Submit
  const handleStep4 = async () => {
    setErrorMessage(null);
    setIsLoading(true);

    try {
      await BusinessService.updateHours(hours, {
        offered: emergencyOffered,
        availability: emergencyAvailability,
      });
      setCurrentStep(5);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save hours');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Complete Setup (Step 5)
  const handleCompleteSetup = async () => {
    setErrorMessage(null);
    setIsLoading(true);

    try {
      await BusinessService.completeOnboarding();
      router.push('/app');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to complete setup');
    } finally {
      setIsLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4">
        <div className="flex items-center space-x-2 text-slate-500 text-sm font-medium">
          <div className="h-4 w-4 border-2 border-sky-600 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading onboarding workspace...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col justify-between p-4 sm:p-8 md:p-12">
      <div className="max-w-4xl w-full mx-auto space-y-8">
        
        {/* Brand Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-200 gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-sky-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
              BC
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">BlueCollar AI</h1>
              <p className="text-xs text-slate-500">Business Workspace Onboarding</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-mono">Step {currentStep} of 5</span>
            <Badge variant="outline" className="border-sky-200 text-sky-700 bg-sky-50 text-[11px]">
              {steps[currentStep - 1]?.name}
            </Badge>
          </div>
        </header>

        {/* Stepper Indicator */}
        <nav aria-label="Progress" className="hidden sm:block">
          <ol className="grid grid-cols-5 gap-2 text-xs font-medium">
            {steps.map((step) => {
              const Icon = step.icon;
              const isDone = step.id < currentStep;
              const isCurrent = step.id === currentStep;

              return (
                <li
                  key={step.id}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors ${
                    isCurrent
                      ? 'border-sky-500 bg-sky-50/50 text-sky-800 font-semibold'
                      : isDone
                      ? 'border-emerald-200 bg-emerald-50/40 text-emerald-800'
                      : 'border-slate-200 bg-white text-slate-400'
                  }`}
                >
                  <div
                    className={`h-6 w-6 rounded-md flex items-center justify-center text-[11px] shrink-0 ${
                      isCurrent
                        ? 'bg-sky-600 text-white'
                        : isDone
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {isDone ? <Check className="h-3.5 w-3.5" /> : step.id}
                  </div>
                  <span className="truncate">{step.name}</span>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-800 text-xs shadow-2xs">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="font-medium leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {/* STEP 1: BUSINESS PROFILE */}
        {currentStep === 1 && (
          <Card className="bg-white border-slate-200/90 shadow-sm rounded-xl">
            <CardHeader className="p-6 sm:p-8 border-b border-slate-100 space-y-1.5">
              <div className="flex items-center gap-2 text-sky-700 text-xs font-semibold uppercase tracking-wider">
                <Building2 className="h-4 w-4" />
                Step 1 &bull; Business Identity
              </div>
              <CardTitle className="text-2xl font-bold text-slate-900">
                Tell us about your business
              </CardTitle>
              <CardDescription className="text-sm text-slate-500">
                Let&apos;s start by setting up your primary HVAC business profile.
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleStep1}>
              <CardContent className="p-6 sm:p-8 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Business Name */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Business Name <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g. Apex Heating & Air Conditioning"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                    <p className="text-[11px] text-slate-400">This is the business name customers will see.</p>
                  </div>

                  {/* Business Phone */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Business Phone
                    </label>
                    <Input
                      type="tel"
                      placeholder="+1 (555) 000-0000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>

                  {/* Business Email */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Business Email
                    </label>
                    <Input
                      type="email"
                      placeholder="service@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  {/* Website */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Website URL (Optional)
                    </label>
                    <Input
                      type="url"
                      placeholder="https://company.com"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </div>
                </div>

                {/* Physical Address */}
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Physical Address
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-4">
                      <Input
                        type="text"
                        placeholder="Street Address"
                        value={street}
                        onChange={(e) => setStreet(e.target.value)}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Input
                        type="text"
                        placeholder="City"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                      />
                    </div>
                    <div>
                      <Input
                        type="text"
                        placeholder="State (e.g. TX)"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                      />
                    </div>
                    <div>
                      <Input
                        type="text"
                        placeholder="ZIP Code"
                        value={zip}
                        onChange={(e) => setZip(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="p-6 bg-slate-50/70 border-t border-slate-100 flex justify-end">
                <Button
                  type="submit"
                  disabled={isLoading}
                  isLoading={isLoading}
                  className="bg-sky-600 hover:bg-sky-700 text-white gap-2 font-medium px-6 shadow-xs"
                >
                  <span>Continue to Services</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardFooter>
            </form>
          </Card>
        )}

        {/* STEP 2: SERVICES */}
        {currentStep === 2 && (
          <Card className="bg-white border-slate-200/90 shadow-sm rounded-xl">
            <CardHeader className="p-6 sm:p-8 border-b border-slate-100 space-y-1.5">
              <div className="flex items-center gap-2 text-sky-700 text-xs font-semibold uppercase tracking-wider">
                <Wrench className="h-4 w-4" />
                Step 2 &bull; Service Catalog
              </div>
              <CardTitle className="text-2xl font-bold text-slate-900">
                What services do you provide?
              </CardTitle>
              <CardDescription className="text-sm text-slate-500">
                Select the services your team offers. Your AI Employee will answer questions about these services.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 sm:p-8 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {services.map((service) => (
                  <div
                    key={service.id}
                    onClick={() => toggleService(service.id)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${
                      service.enabled
                        ? 'border-sky-500 bg-sky-50/30 text-slate-900 shadow-2xs ring-1 ring-sky-500/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-500'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="text-sm font-semibold flex items-center gap-2">
                        <span>{service.name}</span>
                        {service.enabled && (
                          <Badge variant="success" className="py-0 text-[10px]">
                            Active
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 leading-normal">{service.description}</p>
                    </div>
                    <div
                      className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 mt-0.5 ${
                        service.enabled
                          ? 'bg-sky-600 border-sky-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {service.enabled && <Check className="h-3.5 w-3.5" />}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Custom Service */}
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80 space-y-2">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Add Custom Service
                </label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="e.g. Geothermal Heat Pump Installation"
                    value={customServiceName}
                    onChange={(e) => setCustomServiceName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCustomService();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    onClick={addCustomService}
                    variant="outline"
                    className="border-slate-300 bg-white hover:bg-slate-100 text-slate-700 shrink-0 gap-1"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add</span>
                  </Button>
                </div>
              </div>
            </CardContent>

            <CardFooter className="p-6 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentStep(1)}
                className="gap-2 border-slate-300 bg-white text-slate-700"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Button>

              <Button
                type="button"
                onClick={handleStep2}
                disabled={isLoading}
                isLoading={isLoading}
                className="bg-sky-600 hover:bg-sky-700 text-white gap-2 font-medium px-6 shadow-xs"
              >
                <span>Continue to Service Area</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* STEP 3: SERVICE AREA */}
        {currentStep === 3 && (
          <Card className="bg-white border-slate-200/90 shadow-sm rounded-xl">
            <CardHeader className="p-6 sm:p-8 border-b border-slate-100 space-y-1.5">
              <div className="flex items-center gap-2 text-sky-700 text-xs font-semibold uppercase tracking-wider">
                <MapPin className="h-4 w-4" />
                Step 3 &bull; Coverage Zone
              </div>
              <CardTitle className="text-2xl font-bold text-slate-900">
                Where do you provide service?
              </CardTitle>
              <CardDescription className="text-sm text-slate-500">
                Define the geographical territory your technicians typically cover.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 sm:p-8 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Primary City
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. Dallas"
                    value={primaryCity}
                    onChange={(e) => setPrimaryCity(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    State
                  </label>
                  <Input
                    type="text"
                    placeholder="TX"
                    value={areaState}
                    onChange={(e) => setAreaState(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Central ZIP Code
                  </label>
                  <Input
                    type="text"
                    placeholder="75201"
                    value={areaZip}
                    onChange={(e) => setAreaZip(e.target.value)}
                  />
                </div>
              </div>

              {/* Service Radius */}
              <div className="p-5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Travel Service Radius
                  </label>
                  <span className="text-sm font-bold text-sky-700 bg-sky-50 px-3 py-1 rounded-full border border-sky-200">
                    {radiusMiles} miles
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={radiusMiles}
                  onChange={(e) => setRadiusMiles(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-600"
                />
                <p className="text-xs text-slate-500">
                  Customers calling within a {radiusMiles}-mile radius of {primaryCity || 'your central location'} will be automatically qualified for standard service.
                </p>
              </div>
            </CardContent>

            <CardFooter className="p-6 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentStep(2)}
                className="gap-2 border-slate-300 bg-white text-slate-700"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Button>

              <Button
                type="button"
                onClick={handleStep3}
                disabled={isLoading}
                isLoading={isLoading}
                className="bg-sky-600 hover:bg-sky-700 text-white gap-2 font-medium px-6 shadow-xs"
              >
                <span>Continue to Business Hours</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* STEP 4: HOURS & EMERGENCY */}
        {currentStep === 4 && (
          <Card className="bg-white border-slate-200/90 shadow-sm rounded-xl">
            <CardHeader className="p-6 sm:p-8 border-b border-slate-100 space-y-1.5">
              <div className="flex items-center gap-2 text-sky-700 text-xs font-semibold uppercase tracking-wider">
                <Clock className="h-4 w-4" />
                Step 4 &bull; Operating Hours
              </div>
              <CardTitle className="text-2xl font-bold text-slate-900">
                Configure your business schedule
              </CardTitle>
              <CardDescription className="text-sm text-slate-500">
                Set regular hours and emergency availability for your HVAC business.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 sm:p-8 space-y-6">
              {/* Copy Monday quick action */}
              <div className="flex items-center justify-between pb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Weekly Operating Schedule
                </h3>
                <button
                  type="button"
                  onClick={copyMondayHours}
                  className="text-xs text-sky-700 hover:text-sky-800 font-medium hover:underline"
                >
                  Apply Monday hours to all weekdays
                </button>
              </div>

              {/* Hours Table */}
              <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-xl overflow-hidden bg-white">
                {hours.map((row) => (
                  <div
                    key={row.day}
                    className="p-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 w-36">
                      <input
                        type="checkbox"
                        checked={row.isOpen}
                        onChange={(e) => updateHourRow(row.day, 'isOpen', e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        id={`check-${row.day}`}
                      />
                      <label htmlFor={`check-${row.day}`} className="text-sm font-semibold text-slate-800 cursor-pointer">
                        {row.day}
                      </label>
                    </div>

                    {row.isOpen ? (
                      <div className="flex items-center gap-2 text-xs">
                        <input
                          type="time"
                          value={row.openTime}
                          onChange={(e) => updateHourRow(row.day, 'openTime', e.target.value)}
                          className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-800 focus:ring-2 focus:ring-sky-600"
                        />
                        <span className="text-slate-400">to</span>
                        <input
                          type="time"
                          value={row.closeTime}
                          onChange={(e) => updateHourRow(row.day, 'closeTime', e.target.value)}
                          className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-800 focus:ring-2 focus:ring-sky-600"
                        />
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-slate-400 py-1.5">
                        Closed
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Emergency Service Card */}
              <div className="p-5 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-bold text-slate-900">Emergency HVAC Availability</h4>
                    <p className="text-xs text-slate-500">
                      Do you dispatch emergency technicians outside normal business hours?
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={emergencyOffered}
                    onChange={(e) => setEmergencyOffered(e.target.checked)}
                    className="h-5 w-5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                </div>

                {emergencyOffered && (
                  <div className="pt-3 border-t border-slate-200/80 flex gap-4 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800">
                      <input
                        type="radio"
                        name="emergencyAvail"
                        checked={emergencyAvailability === '24/7'}
                        onChange={() => setEmergencyAvailability('24/7')}
                        className="text-sky-600 focus:ring-sky-500"
                      />
                      <span>24/7 Full Emergency</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800">
                      <input
                        type="radio"
                        name="emergencyAvail"
                        checked={emergencyAvailability === 'after_hours'}
                        onChange={() => setEmergencyAvailability('after_hours')}
                        className="text-sky-600 focus:ring-sky-500"
                      />
                      <span>Outside Business Hours Only</span>
                    </label>
                  </div>
                )}
              </div>
            </CardContent>

            <CardFooter className="p-6 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentStep(3)}
                className="gap-2 border-slate-300 bg-white text-slate-700"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Button>

              <Button
                type="button"
                onClick={handleStep4}
                disabled={isLoading}
                isLoading={isLoading}
                className="bg-sky-600 hover:bg-sky-700 text-white gap-2 font-medium px-6 shadow-xs"
              >
                <span>Continue to Review</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* STEP 5: REVIEW & COMPLETE */}
        {currentStep === 5 && (
          <Card className="bg-white border-slate-200/90 shadow-sm rounded-xl">
            <CardHeader className="p-6 sm:p-8 border-b border-slate-100 space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-700 text-xs font-semibold uppercase tracking-wider">
                <CheckCircle2 className="h-4 w-4" />
                Step 5 &bull; Verification & Confirmation
              </div>
              <CardTitle className="text-2xl font-bold text-slate-900">
                Review your business setup
              </CardTitle>
              <CardDescription className="text-sm text-slate-500">
                Review your configuration before launching your BlueCollar AI operations workspace.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 sm:p-8 space-y-6">
              {/* Section 1: Identity */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-sky-600" />
                    Business Identity
                  </h4>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="text-xs text-sky-700 hover:underline font-medium"
                  >
                    Edit
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
                  <div><span className="text-slate-400">Name:</span> <span className="font-semibold">{name}</span></div>
                  <div><span className="text-slate-400">Industry:</span> <span className="font-semibold">{businessType}</span></div>
                  <div><span className="text-slate-400">Phone:</span> {phone || '—'}</div>
                  <div><span className="text-slate-400">Email:</span> {email || '—'}</div>
                  <div className="sm:col-span-2"><span className="text-slate-400">Location:</span> {[street, city, state, zip].filter(Boolean).join(', ') || '—'}</div>
                </div>
              </div>

              {/* Section 2: Services */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <Wrench className="h-3.5 w-3.5 text-sky-600" />
                    Configured Services ({services.filter((s) => s.enabled).length})
                  </h4>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="text-xs text-sky-700 hover:underline font-medium"
                  >
                    Edit
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {services.filter((s) => s.enabled).map((service) => (
                    <Badge key={service.id} variant="secondary" className="text-xs py-0.5">
                      {service.name}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Section 3: Service Area & Hours */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-sky-600" />
                      Service Area
                    </h4>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(3)}
                      className="text-xs text-sky-700 hover:underline font-medium"
                    >
                      Edit
                    </button>
                  </div>
                  <p className="text-xs text-slate-700">
                    <span className="font-semibold">{radiusMiles} miles</span> around {primaryCity || 'Dallas'}, {areaState || 'TX'} {areaZip}
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-sky-600" />
                      Hours & Emergency
                    </h4>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(4)}
                      className="text-xs text-sky-700 hover:underline font-medium"
                    >
                      Edit
                    </button>
                  </div>
                  <p className="text-xs text-slate-700">
                    {hours.filter((h) => h.isOpen).length} days open per week
                  </p>
                  <p className="text-xs text-slate-500">
                    Emergency Service: {emergencyOffered ? `Yes (${emergencyAvailability})` : 'No'}
                  </p>
                </div>
              </div>
            </CardContent>

            <CardFooter className="p-6 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentStep(4)}
                className="gap-2 border-slate-300 bg-white text-slate-700"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Button>

              <Button
                type="button"
                onClick={handleCompleteSetup}
                disabled={isLoading}
                isLoading={isLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-medium px-8 shadow-xs"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Complete Setup & Enter Dashboard</span>
              </Button>
            </CardFooter>
          </Card>
        )}

      </div>

      {/* Footer */}
      <footer className="max-w-4xl w-full mx-auto pt-8 border-t border-slate-200 mt-12 text-center sm:text-left flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-slate-500">
        <div>BlueCollar AI &copy; {new Date().getFullYear()} &bull; Professional HVAC Business Setup</div>
        <div className="font-mono text-[11px] text-slate-500">
          User: {user?.email} &bull; Milestone 3
        </div>
      </footer>
    </div>
  );
}
