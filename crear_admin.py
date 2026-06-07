import asyncio
from sqlalchemy.future import select

# Importamos tu configuración asíncrona
from app.db.session import AsyncSessionLocal, engine
from app.db.base import Base 
from app.models.usuario import UsuarioAdmin
from app.core.security import get_password_hash

async def sembrar_administrador():
    print("Sincronizando tablas en PostgreSQL (Modo Asíncrono)...")
    
    # 1. Creación de la tabla de forma asíncrona
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # 2. Abrimos la sesión con la base de datos
    async with AsyncSessionLocal() as db:
        try:
            # 3. Verificamos si el usuario ya existe usando 'select' y 'await'
            stmt = select(UsuarioAdmin).filter(UsuarioAdmin.username == "admin_nilo")
            resultado = await db.execute(stmt)
            admin_existente = resultado.scalars().first()
            
            if admin_existente:
                print("⚠️ El usuario administrador ya existe en la base de datos.")
                return

            # 4. Generamos el Hash de la contraseña
            password_plana = "AdminNilo2026*"
            password_encriptada = get_password_hash(password_plana)

            # 5. Creamos el registro del usuario
            nuevo_admin = UsuarioAdmin(
                username="admin_nilo",
                email="admin@nilo-cundinamarca.gov.co",
                hashed_password=password_encriptada,
                is_active=True
            )

            # 6. Lo guardamos en PostgreSQL
            db.add(nuevo_admin)
            await db.commit()
            print("✅ ¡Éxito! Administrador maestro creado y encriptado.")

        except Exception as e:
            print(f"❌ Ocurrió un error: {e}")
            await db.rollback()

if __name__ == "__main__":
    print("Iniciando creación de superusuario...")
    # Ejecutamos la función asíncrona usando la librería asyncio
    asyncio.run(sembrar_administrador())