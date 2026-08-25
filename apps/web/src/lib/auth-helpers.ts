import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

type UserRole = 'admin' | 'seller' | 'viewer' | 'admin_readonly'

interface AuthUser {
  id: string
  email: string
  role: UserRole
}

interface AuthSuccessResult {
  success: true
  user: AuthUser
  token: string
}

interface AuthErrorResult {
  success: false
  response: NextResponse
}

type AuthResult = AuthSuccessResult | AuthErrorResult

/**
 * Extracts and validates JWT token from Authorization header
 * Returns authenticated user with role from database
 */
export async function getAuthenticatedUser(
  request: NextRequest
): Promise<AuthResult> {
  // Extract token from Authorization header
  const authHeader = request.headers.get('authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      success: false,
      response: unauthorized('Missing or invalid authorization header'),
    }
  }

  const token = authHeader.replace('Bearer ', '')

  try {
    // Create Supabase client with the token
    const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    })

    // Validate token and get user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        success: false,
        response: unauthorized('Invalid or expired token'),
      }
    }

    // Fetch user role from public.users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (userError || !userData) {
      return {
        success: false,
        response: unauthorized('User not found in database'),
      }
    }

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email || '',
        role: userData.role as UserRole,
      },
      token,
    }
  } catch (error) {
    console.error('Auth error:', error)
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Authentication failed' },
        { status: 500 }
      ),
    }
  }
}

/**
 * Validates if user has one of the allowed roles
 */
export function validateRole(
  userRole: UserRole,
  allowedRoles: UserRole[]
): boolean {
  return allowedRoles.includes(userRole)
}

/**
 * Middleware-style auth helper
 * Validates authentication and checks if user has required role
 */
export async function requireAuth(
  request: NextRequest,
  allowedRoles?: UserRole[]
): Promise<AuthResult> {
  // First, authenticate the user
  const authResult = await getAuthenticatedUser(request)

  if (!authResult.success) {
    return authResult
  }

  // Admin de solo lectura: ve todo lo que vería un 'admin' real, pero
  // cualquier método que escriba se rechaza aquí mismo, antes de llegar al
  // handler de la ruta — es la única barrera real contra escrituras de
  // este rol, ya que varias rutas mutan datos con getServiceSupabase()
  // (bypasea RLS por completo, así que RLS no protege ahí).
  if (authResult.user.role === 'admin_readonly') {
    const isReadMethod = request.method === 'GET' || request.method === 'HEAD'
    if (!isReadMethod) {
      return {
        success: false,
        response: forbidden('Tu perfil es de solo lectura y no puede modificar datos'),
      }
    }
    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes('admin') && !allowedRoles.includes('admin_readonly')) {
      return {
        success: false,
        response: forbidden(
          `Access denied. Required roles: ${allowedRoles.join(', ')}`
        ),
      }
    }
    return authResult
  }

  // If roles are specified, validate them
  if (allowedRoles && allowedRoles.length > 0) {
    if (!validateRole(authResult.user.role, allowedRoles)) {
      return {
        success: false,
        response: forbidden(
          `Access denied. Required roles: ${allowedRoles.join(', ')}`
        ),
      }
    }
  }

  return authResult
}

/**
 * Returns 401 Unauthorized response
 */
export function unauthorized(message: string = 'Unauthorized'): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 })
}

/**
 * Returns 403 Forbidden response
 */
export function forbidden(
  message: string = 'Forbidden - Insufficient permissions'
): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 })
}

/**
 * Returns 400 Bad Request response
 */
export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 })
}

/**
 * Returns 200 OK response with data
 */
export function success<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(data, { status })
}
