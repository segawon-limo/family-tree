-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "no_hp_login" TEXT,
    "password_hash" TEXT NOT NULL,
    "person_id" TEXT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "tanggal_lahir" DATE,
    "tanggal_wafat" DATE,
    "urutan_kelahiran" INTEGER NOT NULL,
    "status_klaim" TEXT NOT NULL DEFAULT 'unclaimed',
    "catatan" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_child" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "tipe" TEXT NOT NULL DEFAULT 'kandung',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_child_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spouse" (
    "id" TEXT NOT NULL,
    "person1_id" TEXT NOT NULL,
    "person2_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'menikah',
    "tanggal_nikah" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_kontak" (
    "person_id" TEXT NOT NULL,
    "no_hp_utama" TEXT,
    "no_hp_alternatif" TEXT,
    "alamat_domisili" TEXT,
    "kota" TEXT,
    "pekerjaan" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_kontak_pkey" PRIMARY KEY ("person_id")
);

-- CreateTable
CREATE TABLE "istilah_panggilan" (
    "id" SERIAL NOT NULL,
    "gap" INTEGER NOT NULL,
    "arah" TEXT NOT NULL,
    "gender" TEXT,
    "posisi" TEXT,
    "istilah" TEXT NOT NULL,

    CONSTRAINT "istilah_panggilan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kode_keluarga" (
    "id" TEXT NOT NULL,
    "kode" TEXT NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expired_at" TIMESTAMP(3),

    CONSTRAINT "kode_keluarga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "klaim_request" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "klaim_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_scope" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "root_person_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_scope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_setup_token" (
    "id" TEXT NOT NULL,
    "klaim_request_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expired_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_setup_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "target_person_id" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_no_hp_login_key" ON "users"("no_hp_login");

-- CreateIndex
CREATE UNIQUE INDEX "users_person_id_key" ON "users"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "parent_child_parent_id_child_id_key" ON "parent_child"("parent_id", "child_id");

-- CreateIndex
CREATE UNIQUE INDEX "spouse_person1_id_person2_id_key" ON "spouse"("person1_id", "person2_id");

-- CreateIndex
CREATE UNIQUE INDEX "istilah_panggilan_gap_arah_gender_posisi_key" ON "istilah_panggilan"("gap", "arah", "gender", "posisi");

-- CreateIndex
CREATE UNIQUE INDEX "kode_keluarga_kode_key" ON "kode_keluarga"("kode");

-- CreateIndex
CREATE UNIQUE INDEX "admin_scope_user_id_root_person_id_key" ON "admin_scope"("user_id", "root_person_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_setup_token_token_key" ON "password_setup_token"("token");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_child" ADD CONSTRAINT "parent_child_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_child" ADD CONSTRAINT "parent_child_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spouse" ADD CONSTRAINT "spouse_person1_id_fkey" FOREIGN KEY ("person1_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spouse" ADD CONSTRAINT "spouse_person2_id_fkey" FOREIGN KEY ("person2_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_kontak" ADD CONSTRAINT "person_kontak_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "klaim_request" ADD CONSTRAINT "klaim_request_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "klaim_request" ADD CONSTRAINT "klaim_request_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "klaim_request" ADD CONSTRAINT "klaim_request_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_scope" ADD CONSTRAINT "admin_scope_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_scope" ADD CONSTRAINT "admin_scope_root_person_id_fkey" FOREIGN KEY ("root_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_setup_token" ADD CONSTRAINT "password_setup_token_klaim_request_id_fkey" FOREIGN KEY ("klaim_request_id") REFERENCES "klaim_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_setup_token" ADD CONSTRAINT "password_setup_token_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_target_person_id_fkey" FOREIGN KEY ("target_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
