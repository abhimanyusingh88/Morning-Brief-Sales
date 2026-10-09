'use client';
import { createContext,useContext } from 'react';
export const ReportContext=createContext<{reportId:string;clientId:string|null}|null>(null);
export const useReportContext=()=>useContext(ReportContext);
