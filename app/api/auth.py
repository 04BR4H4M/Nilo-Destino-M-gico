from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.usuario import UsuarioAdmin
from app.core.security import verify_password, create_access_token

router = APIRouter()

# Dependencia para obtener la base de datos
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

@router.post("/login", response_model=dict)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    # 1. Buscamos al usuario en la base de datos
    stmt = select(UsuarioAdmin).filter(UsuarioAdmin.username == form_data.username)
    resultado = await db.execute(stmt)
    user = resultado.scalars().first()

    # 2. Verificamos si existe y si la contraseña es correcta
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 3. Fabricamos el Token JWT
    access_token = create_access_token(data={"sub": user.username})
    
    # 4. Devolvemos el token al frontend
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "usuario": user.username
    }