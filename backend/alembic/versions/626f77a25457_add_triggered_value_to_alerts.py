"""add triggered_value to alerts

Revision ID: 626f77a25457
Revises:
Create Date: 2026-05-20 07:33:39.342249

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '626f77a25457'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('alerts', sa.Column('triggered_value', sa.Float(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('alerts', 'triggered_value')
