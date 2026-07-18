import React, { useState, useEffect, useCallback } from 'react';
import { getFailedServices, ServiceStatus, HEALTH_EVENT } from '../systemHealth';
import type { ProfileRow } from '../types';

export function useHealthMonitor(_profile: ProfileRow | null) {
    const [healthErrors, setHealthErrors] = useState<ServiceStatus[]>([]);

    const refreshHealth = useCallback(() => {
        setHealthErrors(getFailedServices());
    }, []);

    useEffect(() => {
        refreshHealth();
        window.addEventListener(HEALTH_EVENT, refreshHealth);
        return () => window.removeEventListener(HEALTH_EVENT, refreshHealth);
    }, [refreshHealth]);

    return { healthErrors, setHealthErrors, refreshHealth };
}
