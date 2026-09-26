import {body} from '@/app/lib/simulation/http';
import {failure} from '@/app/lib/simulation/server';
import { createClient } from "@/app/lib/supabase/server";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let values:Record<string,unknown>;
  try{values=await body(request);}catch(e){return failure(e);}
  const {email,password,fullName,role,inviteToken}=values;
  let claimedInviteId:string|undefined;

  if (typeof email!=='string'||typeof password!=='string'||typeof fullName!=='string'||!email||!password||!fullName) {
    return NextResponse.json({ error: "Email, mot de passe et nom complet requis" }, { status: 400 });
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: "Format d'email invalide" }, { status: 400 });
  }

  // Password strength — minimum 8 chars, at least 1 letter and 1 number
  if (password.length < 8) {
    return NextResponse.json({ error: "Le mot de passe doit contenir au moins 8 caractères" }, { status: 400 });
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return NextResponse.json({ error: "Le mot de passe doit contenir au moins une lettre et un chiffre" }, { status: 400 });
  }

  if (role!==undefined && (typeof role!=="string"||!["manager", "student"].includes(role))) {
    return NextResponse.json({ error: "Rôle invalide" }, { status: 400 });
  }

  // Manager registration requires a valid invite token
  if (role === "manager") {
    if (!inviteToken || typeof inviteToken !== "string" || !inviteToken.trim()) {
      return NextResponse.json({ error: "Code d'invitation requis pour créer un compte administrateur" }, { status: 400 });
    }

    const adminDb = createAdminClient();

    const { data: invite, error: inviteError } = await adminDb
      .from("manager_invites")
      .select("id, is_used")
      .eq("token", inviteToken.trim())
      .single();

    if (inviteError || !invite) {
      return NextResponse.json({ error: "Code d'invitation invalide ou déjà utilisé" }, { status: 403 });
    }

    if (invite.is_used) {
      return NextResponse.json({ error: "Code d'invitation invalide ou déjà utilisé" }, { status: 403 });
    }

    // Mark the token as used
    const { data: claimed, error: updateError } = await adminDb
      .from("manager_invites")
      .update({ is_used: true })
      .eq("id", invite.id).eq("is_used", false).select("id").maybeSingle();

    if (updateError || !claimed) {
      console.error("[signup] Failed to mark invite as used:", updateError?.message||"Invite already claimed");
      return NextResponse.json({ error: "Erreur interne, veuillez réessayer" }, { status: 500 });
    }
    claimedInviteId=claimed.id;
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,

      },
    },
  });

  if (error) {
    // If signup fails after marking token as used, revert the token
    if (claimedInviteId) {
      const adminDb = createAdminClient();
      await adminDb
        .from("manager_invites")
        .update({ is_used: false })
        .eq("id", claimedInviteId);
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if(role==='manager'){
    // Obfuscated duplicate signups must never promote an existing account.
    if(!data.user||!data.user.identities?.length)return NextResponse.json({error:'Compte déjà existant ou inscription non confirmée. Connectez-vous avec votre compte.'},{status:409});
    const adminDb=createAdminClient();
    const {error:trustedError}=await adminDb.auth.admin.updateUserById(data.user.id,{app_metadata:{role:'manager'}});
    if(trustedError)return NextResponse.json({error:'Compte créé, mais activation administrateur indisponible. Contactez votre formateur.'},{status:503});
    const {error:profileError}=await adminDb.from('profiles').update({role:'manager'}).eq('id',data.user.id);
    if(profileError)return NextResponse.json({error:'Compte créé, mais profil administrateur indisponible.'},{status:503});
  }
  return NextResponse.json({ user: data.user });
}
