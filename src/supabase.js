import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── PROYECTOS ─────────────────────────────────────────────────
export async function fetchProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchProject(id) {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// ── NDVI ──────────────────────────────────────────────────────
export async function fetchNDVI(projectId) {
  const { data, error } = await supabase
    .from('ndvi_records')
    .select('*')
    .eq('project_id', projectId)
    .order('date', { ascending: true })
  if (error) throw error
  return data
}

// ── REPORTES ──────────────────────────────────────────────────
export async function fetchLatestReport(projectId) {
  const { data, error } = await supabase
    .from('verification_reports')
    .select('*')
    .eq('project_id', projectId)
    .order('report_date', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0] || null
}

// ── SPONSORS ──────────────────────────────────────────────────
export async function fetchSponsor(projectId) {
  const { data, error } = await supabase
    .from('sponsorships')
    .select('*')
    .eq('project_id', projectId)
    .limit(1)
  if (error) throw error
  return data?.[0] || null
}

// ── ORGANIZACIONES ────────────────────────────────────────────
export async function fetchOrganization(id) {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// ── INSERTAR PROYECTO ─────────────────────────────────────────
export async function insertProject(project) {
  const { data, error } = await supabase
    .from('projects')
    .insert([project])
    .select()
    .single()
  if (error) throw error
  return data
}

// ── INSERTAR ALERTA ───────────────────────────────────────────
export async function insertAlert(alert) {
  const { data, error } = await supabase
    .from('alerts')
    .insert([alert])
    .select()
    .single()
  if (error) throw error
  return data
}