import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://dtmgaovsxxowbjtqpbbk.supabase.co/rest/v1/'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0bWdhb3ZzeHhvd2JqdHFwYmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Nzk4OTUsImV4cCI6MjA5NDA1NTg5NX0.ljDmvOhtCOU4J9WvWjJN-NYmpAEb4SZ0dj8wc4-z0Ko'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)